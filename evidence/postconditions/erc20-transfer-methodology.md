# ERC20TransferAdapter — methodology

Gate 3. Documents how `ERC20TransferAdapter` (`packages/postconditions/src/erc20-transfer-adapter.ts`) derives what to check and how it checks it, and the research behind each decision.

## Calldata decoding — no 4-byte selector

Governor Bravo stores `signature` and `calldata` as two separate array fields (`getActions`), and Gate 2 confirmed live against Compound #220 that `calldata` contains only the ABI-encoded arguments — no 4-byte function selector prefix (see `evidence/governor/bravo-methodology.md`). `ERC20TransferAdapter` therefore decodes with `decodeAbiParameters([address, uint256], calldata)` (`packages/postconditions/src/decode-transfer-calldata.ts`), never with viem's `decodeFunctionData`, which expects a selector-prefixed payload and would either throw or silently misdecode against Bravo's representation. `decode-transfer-calldata.test.ts` has a dedicated test proving a selector-prefixed payload does **not** decode to the correct amount under this scheme — confirming the two representations are not interchangeable.

## Supported signature — exact string match only

`supports(ctx)` accepts only the literal signature `"transfer(address,uint256)"`. No fuzzy matching, no substring checks, no fallback on `transferFrom`. This is a deliberate, narrow gate (Gate 3 instructions §29): support is never inferred from proposal title, description text, or token symbol — only from `ctx.signature` and successful decoding of `ctx.calldata` against that exact signature.

## Token address — from the action target, never inferred

For a direct ERC20 transfer, the token contract is exactly `action.target` (Gate 3 instructions §11). `ERC20TransferAdapter` never looks up a token by symbol, never trusts Cactus/proposal text for "which token," and never calls a registry. `snapshot()` sets `preState.token = ctx.target` directly.

## Recipient and amount — from decoded calldata only

Both come from `tryDecodeErc20Transfer(ctx.signature, ctx.calldata)`. Nothing else contributes to these two values — not proposal prose, not Cactus metadata, not an LLM. See `evidence/postconditions/historical-fixture/README.md` for a live-recomputed proof of this derivation against a real transaction.

## Pre-state — block-pinned, never opportunistic

`snapshot()` requires `ctx.preStateBlock` to be set and throws (`BALANCE_READ_FAILED`) if it is absent, rather than silently reading "whatever the current balance happens to be." `recipientBalanceBefore` is read via `balanceOf(recipient)` pinned to that exact block (Gate 3 instructions §15).

## Expected state — pure, bigint-only arithmetic

`deriveExpected()` is synchronous and touches no network. `expectedRecipientBalanceAfter = preState.recipientBalanceBefore + authorizedAmount`, computed entirely in `bigint` — no floating point anywhere in the verification path (Gate 3 instructions §16/§39). Token `decimals()`/`symbol()` are read only for the live proof script's human-readable console/evidence output; the adapter itself never calls either.

## Verification — balance delta AND execution-bound Transfer log, both required

`verify()` computes `observedDelta = recipientBalanceAfter - recipientBalanceBefore` at `ctx.verificationBlock`, and separately fetches `ctx.executionTxHash`'s own transaction receipt to look for a matching `Transfer` log. Both checks must pass for `verified: true` — a matching balance delta with no corroborating log, or vice versa, is **not** sufficient (Gate 3 instructions §18-19). This directly follows from the "concurrent-transfer problem": a recipient's balance can change between two blocks for reasons unrelated to the authorized transfer, so balance delta alone is not sufficient attribution evidence, and a Transfer log's existence somewhere in a block is not sufficient either — only a log inside the *specific execution transaction's own receipt* corroborates.

## Transfer log attribution — deterministic matching key, fails closed on ambiguity

`packages/postconditions/src/transfer-log-match.ts`'s `matchTransferLog` uses the matching key `(token, recipient, amount)` scoped to one transaction's receipt (the "transaction binding" from Gate 3 instructions §25). Outcomes:

- Exactly one log matches the full key → `MATCHED`.
- No log matches recipient at all → `MISSING`.
- A log matches recipient but not amount → `MISMATCH`.
- Two or more logs match the full key (truly indistinguishable) → `AMBIGUOUS` — fails closed, never guesses an index.

## RPC selection — free "public" RPCs are not interchangeable for historical reads

Multiple advertised-as-free public Ethereum RPC endpoints were tested live in this session. Several reject `eth_call`/`eth_getLogs` pinned more than ~100-128 blocks behind the chain head with "archive requests require a personal token" (`ethereum-rpc.publicnode.com`) or an outright request failure (`eth.llamarpc.com`, `rpc.ankr.com`, `1rpc.io`, `ethereum.blockpi.network`); one (`eth.drpc.org`) served historical reads correctly in initial testing but later returned "Request timeout on the free plan, please upgrade to paid plan" for a routine `decimals()` call during the actual proof run. `https://rpc.mevblocker.io` was confirmed to reliably serve arbitrarily historical `eth_call`s, `eth_getTransactionReceipt`, and `eth_getBlock` reads across repeated runs in this session, and is the default used by `scripts/prove-erc20-postcondition.ts` (overridable via `ETHEREUM_RPC_URL`). This is documented explicitly because it materially affects reproducibility — see `evidence/postconditions/limitations.md`.
