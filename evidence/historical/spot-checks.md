# Gate 8 spot-checks

Manual, auditable spot-checks of five records from the committed
`historical-governor-fulfillment.json`, cross-referenced against canonical
chain data using a **second, independent public RPC endpoint**
(`https://eth.drpc.org`) — deliberately different from the endpoint the
primary reproduction pipeline used (`https://ethereum.reth.rs/rpc`, viem's
default mainnet transport). Reproduce with:

```
pnpm spot-check:historical
```

Full console output: `evidence/historical/spot-check-output.txt`.

## What each check verifies

1. **Execution block timestamp == `executedAt`** — reads the block directly
   by number and compares its timestamp to the recorded value.
2. **Execution tx succeeded and the Governor emitted `ProposalExecuted(id)`**
   — fetches the transaction receipt, filters its logs to those emitted by
   the Governor contract address, decodes them against the real
   `ProposalExecuted(uint256 id)` event ABI, and confirms one matches the
   record's proposal ID.
3. **Queue tx succeeded and the Governor emitted `ProposalQueued(id, eta)`**,
   with the emitted `eta` equal to `executionEligibleAt` — same pattern as
   above, for the queue side.
4. **Current on-chain `proposals(id).eta` still equals `executionEligibleAt`**
   — an independent read of present-day contract storage, not derived from
   any event log.
5. **Arithmetic**: `executedAt - executionEligibleAt == fulfillmentIntervalSeconds`.

## Records checked

| DAO | # | Why chosen | Interval |
|---|---|---|---|
| Compound | 220 | Required case study (§18): severe multi-day case | 381,828s (~106.06h / 4.42d) |
| Uniswap | 20 | Required case study (§18): longest interval in the dataset | 832,115s (~9.63d) |
| Compound | 150 | Near-zero interval (dataset minimum, tied) | 12s |
| Compound | 176 | A >24h interval outside the top-10 longest list | 94,488s (~26.25h) |
| Compound | 129 | Median-ish interval (dataset median is 132s) | 108s |

**Result: all five records pass all five checks against the independent RPC.**

## Compound #220

- `executionEligibleAt` = 1709555375, `executedAt` = 1709937203, interval = 381,828s
- Queue: tx `0xf17914c20aed58a8623e859b7fea680d9d8bb2f0a86bf6055a128c6f271e14a4`, block 19,347,487
- Execution: tx `0xb1c460f54f61709a8d43c1ee930296be268c0b057cbd496c6d5138487598c541`, block 19,393,409
- Both transactions were sent directly to the Compound Governor Bravo
  contract (`0xc0da...6529`) and succeeded. The Governor's own
  `ProposalQueued`/`ProposalExecuted` events match id 220 with `eta`
  matching `executionEligibleAt` exactly.
- This is a genuine, real ~4.4-day gap between eligibility and execution
  observed on Compound's own Governor Bravo contract. Nothing about *why*
  this gap occurred is claimed here — only that it happened, per the
  onchain record.

## Uniswap #20

- `executionEligibleAt` = 1655734175, `executedAt` = 1656566290, interval = 832,115s (the longest in the entire 353-record dataset)
- Queue: tx `0x9d2522758a7d91b95d0117ed2a134664a5b6373ef4432518c4dc4e0731bb29ae`, block 14,985,406
- Execution: tx `0xd6af2d88618f78502cc9d167c57cb7360ba3e578fbfed72c10c624b050bb38f0`, block 15,048,760
- Both transactions were sent directly to the Uniswap Governor Bravo
  contract (`0x408e...24c3`) and succeeded, with matching events.

## Compound #150 — a genuine discovery, not a bug

- `executionEligibleAt` = 1677923411, `executedAt` = 1677923423, interval = 12s
- Queue: tx `0xa574a8ed8b649fc6366190a194b3647716a6c252ca2dde17629084182261579f`, block 16,740,100
- Execution: tx `0x23b70101e2b6aa0fc401d4d515f395ce8b2fdf58d2c528daf3906afcbe2daf59`, block 16,754,298

The first version of this spot-check script asserted that each
transaction's top-level `to` field must equal the Governor address, and
this record **failed** that assertion: both the queue and execute
transactions for proposal #150 were sent to
`0x02777053d6764996e594c3e88af1d58d5363a2e6` — a contract with substantial
bytecode (~24KB), not the Governor itself, and not an address that appears
anywhere else in this dataset's top-level `to` fields.

Investigating further (reading the transaction receipts' full log lists)
showed that this intermediary contract calls into the Governor internally:
the Governor's own `ProposalQueued`/`ProposalExecuted` events, with the
correct proposal id and `eta`, are present in both transactions' logs,
alongside a custom event emitted by the intermediary contract itself. In
other words: proposal #150 was queued and executed through a relay/batcher
contract rather than a direct EOA-to-Governor call, but the Governor's own
authoritative state and events are exactly as expected.

**This was a spot-check methodology bug, not a dataset bug.** The primary
reproduction pipeline never relied on `tx.to` — it identifies
`ProposalQueued`/`ProposalExecuted` events via `getLogs` filtered by the
Governor's own contract address, which is unaffected by how a transaction
was routed to reach it. Only this spot-check script's *first draft*
over-asserted on `to`. It was corrected to check for Governor event
emission within the transaction's logs instead (the same signal the
primary pipeline uses), and the record now passes cleanly. The corrected
check is what ships in `spot-check-historical-baseline.ts`.

No claim is made here about what the intermediary contract is for (a
governance-automation relay, a multisig batch executor, or something else)
— identifying it further is out of scope for this gate. The only claim is:
the Governor's own onchain record for proposal #150 is internally
consistent and matches the committed dataset.

## Compound #176 (>24h, not in the top-10)

- `executionEligibleAt` = 1692633995, `executedAt` = 1692728483, interval = 94,488s (~26.25h)
- Queue: tx `0xef2080cc4ded1bb82185c2ba9ea8756b4e6f1e7e5762a40ec8c807abf76fcc5e`, block 17,949,901
- Execution: tx `0xf73e5eee743d32947d3683b23861cfc0f5796c20098d8fee3372c2b2ecec9cae`, block 17,972,006
- Direct calls to the Governor, all checks pass. Included specifically to
  confirm the `>24h` bucket contains real, verifiable cases beyond the
  handful already featured in the top-10-longest list.

## Compound #129 (median-ish)

- `executionEligibleAt` = 1665934343, `executedAt` = 1665934451, interval = 108s
- Queue: tx `0xeeee06c70280712f2844bf56af60df18bb8f5f1fbc32cea2e3a2a208f050238a`, block 15,747,264
- Execution: tx `0x32ed7881b6fcf6ed837b3808597add60ddef8f66c039f08c67ac323f07a48f85`, block 15,761,599
- Direct calls to the Governor, all checks pass. 108s is close to (though
  not identical to) the dataset's overall median of 132s, confirming the
  fast-majority end of the distribution is not an artifact of aggregation.

## RPC endpoints considered for this spot-check

| Endpoint | Result |
|---|---|
| `https://eth.llamarpc.com` | Down at the time of this run — HTTP 525 SSL handshake failure |
| `https://ethereum-rpc.publicnode.com` | Free tier rejects archive-depth `eth_getLogs`/`eth_getTransactionReceipt` for transactions this old ("Archive requests require a personal token") |
| `https://rpc.ankr.com/eth` | Requires an API key outright |
| `https://eth.drpc.org` | **Used** — free, no key required, confirmed live to serve archive logs and receipts for multi-year-old blocks |
