# KeeperHub wallet execution model — read-only investigation

This document investigates, read-only, what the accidental transaction in `evidence/keeperhub/incidents/001-omitted-simulate-executed.md` actually proves about KeeperHub's wallet/execution architecture. Every fact below was independently verified via a public Sepolia RPC (`eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_getCode`, `eth_getBalance`) — nothing here is taken from KeeperHub's own API response or marketing copy without independent confirmation.

**Scope warning (see corrective instructions §14):** this transaction was a plain native ETH transfer (`/api/execute/transfer`), not a contract call. Some conclusions below are explicitly marked as not generalizable to `/api/execute/contract-call` or to Governor-style writes, because a plain transfer never exercises the "does a downstream contract see the wallet as `msg.sender`" question that matters for Gate 2's caller-authority model.

## Addresses involved

| Role | Address | Evidence |
|---|---|---|
| Org wallet (from `/api/user`) | `0xeecbc82818e591b92e6dd54aa7589b0b9fed6160` | `/api/user` response |
| Transaction sender (`tx.from`, gas payer) | `0xa17cb6adb58277e5b4a44b8c1ecb449bb6614e87` | `eth_getTransactionByHash` |
| Transaction target (`tx.to`) | `0x5af5194b4b0909eb978e3cf1e25333852277f07d` | `eth_getTransactionByHash` |
| EIP-7702 authorization delegate | `0x955d84139e7621bc571b117d8eb5d28a4a222c6f` | `tx.authorizationList[0].address` |

## PROVEN (independently verified on-chain)

1. The transaction is EIP-7702 type (`type: "0x4"`), carrying one `authorizationList` entry: `{ chainId: 0xaa36a7 (11155111), address: 0x955d84139e7621bc571b117d8eb5d28a4a222c6f, nonce: 0x0 }`.
2. `eth_getCode` on the **org wallet address**, taken at the block *before* this transaction, returns `0x` — the wallet was a plain EOA with no delegated code prior to this transaction.
3. `eth_getCode` on the **org wallet address**, taken *after* this transaction (`latest`), returns `0xef0100955d84139e7621bc571b117d8eb5d28a4a222c6f` — the standard EIP-7702 delegation designator (`0xef0100` prefix + 20-byte delegate address). This transaction is what established the wallet's delegation to `0x955d84139e7621bc571b117d8eb5d28a4a222c6f`.
4. `eth_getCode` on `0xa17cb6adb58277e5b4a44b8c1ecb449bb6614e87` (`tx.from`) returns `0x` — the transaction submitter/gas-payer is a plain EOA, not a contract. It is acting as a relayer/sponsor, not the wallet itself.
5. `eth_getCode` on `0x5af5194b4b0909eb978e3cf1e25333852277f07d` (`tx.to`) returns substantial bytecode implementing a multi-selector router/gateway contract. The function selector `0x9aefaff8` — which is the leading 4 bytes of the actual transaction's `input` calldata — is one of the selectors dispatched by this contract.
6. `eth_getCode` on the authorization delegate `0x955d84139e7621bc571b117d8eb5d28a4a222c6f` returns substantial bytecode. The raw bytecode contains the plaintext ASCII strings `"TKGasDelegate"` and `"1.1"`, laid out as an EIP-712 domain name/version pair. The contract also exposes selectors matching a smart-account-style interface, including `0xb61d27f6` (`execute(address,uint256,bytes)`) and `0x1626ba7e` (ERC-1271 `isValidSignature`).
7. `receipt.status = 0x1` (success), `receipt.logs = []` (no events — expected for a plain native-token transfer with no ERC20/contract involvement), `gasUsed = 0x12411` (74,257).
8. The org wallet's ETH balance, queried independently after the transaction, is exactly `0.05 ETH` — unchanged from the amount funded before any of this session's KeeperHub calls. Despite this transaction consuming 74,257 gas, none of that gas was debited from the wallet's own balance (and the transfer was to itself, netting the value to zero). Gas was paid by `tx.from` (the relayer/sponsor address), not the wallet.

## INFERRED (reasonable reading of the evidence, not independently confirmed against KeeperHub/Turnkey source or documentation)

1. `"TKGasDelegate"` strongly suggests this is a **Turnkey**-authored EIP-7702 delegate contract ("TK" = Turnkey), consistent with KeeperHub's documented claim that every organization gets a "Turnkey non-custodial wallet." This is inferred from the embedded string match alone — this investigation did not cross-reference Turnkey's own published contract addresses or ABI to confirm authorship.
2. The router contract at `tx.to` likely acts as an entrypoint that KeeperHub's backend calls with a signed payload (the calldata contains what appears to be signature-shaped bytes alongside the recipient/amount), which in turn invokes the delegate's `execute`-style function to move value out of the now-delegated wallet address. This is inferred from selector/calldata shape, not from decompiled or source-verified logic.
3. Per general EIP-7702 semantics, once an EOA delegates to a contract, calls that delegated code *makes outward* (e.g., to a third-party contract like a Governor) would normally present the wallet's own address as `msg.sender` to that third party, not the relayer's address. **This is a general EIP-7702 property, not something this specific transaction demonstrates** — a plain value transfer makes no outward call to a third contract, so this transaction contains no direct evidence of what a downstream contract would observe.

## UPDATE — the controlled Gate 1B probe answered item 1

A deliberate, authorized `executeContractCall` (WETH.approve(0x...dEaD, 1337) on Sepolia, via `packages/keeperhub`) landed as tx `0x674e6ee957e8d2470e8120cad36f0e3325309d158b364a76d9c3f0aa023f95be`. Its receipt contains exactly one log: the standard ERC20 `Approval(address indexed owner, address indexed spender, uint256 value)` event, with:

```text
topics[1] (indexed owner)   = 0x000000000000000000000000eecbc82818e591b92e6dd54aa7589b0b9fed6160
topics[2] (indexed spender) = 0x000000000000000000000000000000000000000000000000000000000000dead
data (value)                 = 0x0000000000000000000000000000000000000000000000000000000000000539 (1337)
```

Since ERC20 `approve()`'s canonical implementation emits `Approval(msg.sender, spender, amount)`, this is **direct, on-chain, independently-verified proof** that WETH observed `msg.sender == 0xeecbc82818e591b92e6dd54aa7589b0b9fed6160` — **the org wallet's own address**, not the relayer's (`0xa17cb6...`) and not the router contract's (`0x5af519...`). This promotes item 1 from UNKNOWN to **PROVEN**.

Also newly observed: this second transaction is EIP-1559 type `0x2`, **not** type `0x4` (EIP-7702) like the first — the wallet's delegation, once set, persists across transactions and does not need to be re-authorized each time. `tx.from` (`0xa17cb6...`) and `tx.to` (`0x5af519...`) are identical to the first transaction, consistent with a stable, dedicated relayer and router per organization (narrows, but does not fully close, UNKNOWN item 2 below — two data points, same organization).

Independent state verification: `allowance(owner, spender)` read via a fresh `eth_call` after the transaction returned `1337`, matching exactly what was authorized — confirming the effect matched the intent, not merely that a transaction with `status: 0x1` occurred.

## UNKNOWN (not established by this investigation; still open)

1. ~~What `msg.sender` a third-party contract observes~~ — **PROVEN above.**
2. Whether the relayer/sponsor address (`0xa17cb6...`) is dedicated to this organization or shared/rotating across KeeperHub's user base — two same-org transactions used the same relayer, which is consistent with either "dedicated" or "shared but stable within a session"; still not conclusively distinguished.
3. Whether workflow-triggered writes (via `/api/workflows` + a workflow run) go through this same EIP-7702 + relayer-sponsorship path, or a different signing/submission mechanism than the direct `/api/execute/*` routes.
4. The full semantics of the router contract at `tx.to` — this investigation read its bytecode's selector table only; it was not decompiled in full or matched against a source-verified copy on a block explorer.
5. Whether this same architecture (EIP-7702 delegation + gas-sponsoring relayer) is used on non-Sepolia chains, or is Sepolia/testnet-specific.

## Why this matters for Gate 2

PRD.md §8.2 requires a "caller model for the actual KeeperHub sender" so Marked can prove "the actual KeeperHub sender may call the demo Governor's execute, or block the family." **This is now answered for the direct-execute surface**: a Governor's `onlyGovernance`-style caller check (or any `msg.sender`-based access control) would see the org wallet's own address, not a relayer or router address. This does not yet cover the workflow-triggered execution surface (UNKNOWN item 3) — Gate 2 should not assume the two surfaces share this property without their own evidence.
