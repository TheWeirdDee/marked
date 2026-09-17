# ERC20TransferAdapter — supported and unsupported semantics

Gate 3 instructions §9-10, §20-22. Narrow, proven support beats broad, unproven support.

## Supported (v1)

- Exactly one signature: `transfer(address,uint256)`.
- Governor Bravo's action representation: `signature` and `calldata` as two separate fields, `calldata` holding only the ABI-encoded `(address,uint256)` arguments (no 4-byte selector).
- Standard-compliant ERC20 tokens: `balanceOf` and `Transfer(address,address,uint256)` behave exactly as specified — one token unit transferred authorizes exactly one token unit of recipient balance increase, corroborated by exactly one matching `Transfer` log in the execution transaction's own receipt.
- Verified live against a real historical USDC transfer — see `evidence/postconditions/historical-fixture/`.

## Explicitly unsupported (v1) — and why

- **`transferFrom(address,address,uint256)`.** Different economic semantics (moves tokens out of a third party's balance under an allowance, not the caller's own balance) and a different authority model (depends on a pre-existing `approve`). Gate 3 instructions §10 forbid treating it as equivalent to `transfer`. `tryDecodeErc20Transfer` rejects any signature other than the exact `transfer(address,uint256)` string, so `transferFrom` always fails `supports()` — proven in `decode-transfer-calldata.test.ts` and `erc20-transfer-adapter.test.ts`.
- **Fee-on-transfer tokens.** A token that authorizes `transfer(recipient, 100)` but delivers less than 100 to the recipient (a fee withheld in-protocol) will fail this adapter's `RECIPIENT_BALANCE_DELTA` check even when its `Transfer` log reports the full authorized amount — proven in `erc20-transfer-adapter.test.ts`'s "fee-on-transfer-shaped mismatch" test. The adapter does not special-case this: it fails closed (`verified: false`, reason `BALANCE_DELTA_MISMATCH`), exactly as required — it never "allows fees," reinterprets the expected amount, or asks an LLM to adjudicate (§20).
- **Rebasing tokens.** A token whose balance changes independently of any transfer (positive or negative rebasing) will also produce a delta that does not exactly equal the authorized amount, and fails the same way — proven in the "rebasing-shaped mismatch" test (§21).
- **ERC777-style callbacks, proxy-specific transfer behavior, blacklist mechanics, nonstandard return values, or any other unmodeled semantics.** Not claimed, not tested, not special-cased (§22). If such a token's behavior happens to still satisfy the plain balance-delta-plus-log check, it will verify; if it does not, it fails closed exactly like any other mismatch. No behavior specific to these token classes is implemented.

## Multi-action proposals

The adapter is scoped to exactly one `actionIndex` per invocation (via `ProposalActionContext.actionIndex`) and asserts nothing about any other action in the same proposal. Bundle-level coverage semantics (`FULL`/`PARTIAL`/`UNSUPPORTED`, and the rule that one verified action never makes an otherwise-incomplete bundle look green) are handled separately by `classifyCoverage`/`isBundleVerified` in `packages/postconditions/src/index.ts` — see `packages/postconditions/src/index.test.ts`.
