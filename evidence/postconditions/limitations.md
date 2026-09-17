# ERC20TransferAdapter — known limitations

Gate 3 instructions §20-22, §31, §43, §53. Recorded explicitly rather than left implicit.

## Token semantics not supported

- **Fee-on-transfer tokens.** Documented and tested to fail closed (`erc20-transfer-semantics.md`, `mutation-tests.md`) — never silently reinterpreted.
- **Rebasing tokens.** Same treatment.
- **ERC777-style callbacks, proxy-specific transfer quirks, blacklist mechanics, nonstandard return values.** Not modeled, not tested, no special-case behavior.
- **`transferFrom`.** A different economic and authority model; unsupported by design, not merely untested.

## Attribution limits

- Corroboration reads the **execution transaction's own receipt only** (`getTransactionReceipt`), not a block-range `eth_getLogs` scan. This was a deliberate choice (Gate 3 instructions §43: prefer broadly-available `eth_getTransactionReceipt` over trace APIs or wide log scans) and it means: if the actual on-chain effect happened in a *different* transaction than the one recorded as `ctx.executionTxHash` (e.g. a wrong hash was supplied upstream), the adapter fails closed as `TRANSFER_LOG_MISSING` — it does not search elsewhere to "find" the real transaction. This is intentional (never guess), but it does mean the adapter's correctness is bounded by the correctness of `executionTxHash` itself, which this gate does not independently verify against Governor lifecycle-call evidence — that binding is a later-gate concern (KeeperHub execution, Gate 5).
- Ambiguous attribution (two or more indistinguishable matching `Transfer` logs within one receipt — e.g. two separate proposal actions transferring the identical amount to the identical recipient in one transaction) is refused (`AMBIGUOUS_TRANSFER_EVIDENCE`), not resolved. There is currently no mechanism to disambiguate multiple genuinely-identical transfers to the same recipient for the same amount within one transaction; each would need an additional binding signal (e.g. log index ordering matched to action-plan ordering) that is not implemented in v1.

## Trace/debug API dependency

None. The adapter uses only `eth_call` (via `readContract`), `eth_getTransactionReceipt`, and `eth_getBlockNumber` — no `debug_traceTransaction` or similar, since those are not broadly available on public RPC infrastructure (Gate 3 instructions §43).

## RPC provider dependency for historical reads

Not every RPC endpoint advertised as a free public Ethereum gateway serves historical (non-"latest") `eth_call`s. In this session: `ethereum-rpc.publicnode.com` refused reads more than ~100-128 blocks behind the chain head ("Archive requests require a personal token"); `eth.llamarpc.com`, `rpc.ankr.com/eth`, `1rpc.io/eth`, and `ethereum.blockpi.network` failed outright during testing; `eth.drpc.org` served historical reads correctly in initial probing but later returned a "free plan" timeout mid-proof-run. `rpc.mevblocker.io`, `eth-mainnet.public.blastapi.io`, and `gateway.tenderly.co/public/mainnet` were all confirmed reliable for this fixture's specific historical block range; `scripts/prove-erc20-postcondition.ts` defaults to `rpc.mevblocker.io` and accepts `ETHEREUM_RPC_URL` as an override. A judge or developer re-running this proof against a different, non-archive-capable RPC should expect historical `eth_call`s to fail with a provider-side error, not a Marked-side bug — this is a known, documented reproducibility caveat (Gate 3 instructions §53), not an adapter defect. No public RPC's continued free availability, rate limits, or archive depth is guaranteed by Marked.

## Execution-block assumption

The live fixture uses `preStateBlock = executionBlock − 1` and `verificationBlock = executionBlock`. This is a clean, simple, and documented model (Gate 3 instructions §34), but it means: any other transaction touching the same recipient's balance within the *same* execution block would also be captured in the observed delta. For this fixture, the execution transaction's receipt contains exactly one log total, and the balance delta exactly equals the authorized amount, so no such contamination occurred — but the adapter's balance-delta check alone does not, and cannot, rule this out in general. This is precisely why the execution-bound Transfer log check is mandatory, not optional corroboration (see `erc20-transfer-methodology.md`, "concurrent-transfer problem").

## Not proven at Gate 3

- Any live KeeperHub execution feeding this adapter (Gate 5+).
- Any live Governor Bravo proposal whose authorized action is actually a plain ERC20 `transfer` (Compound #220's two actions are `setTargetReserves`/`deployAndUpgradeTo`, neither of which this adapter supports — correctly, since it is not claimed to).
- Multi-action bundle evaluation wired end-to-end against a real multi-action Governor proposal — `classifyCoverage`/`isBundleVerified` are proven as pure functions against synthetic inputs only.
