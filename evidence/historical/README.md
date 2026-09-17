# Gate 8 — Historical Governor Fulfillment Baseline

This directory contains the reproducible evidence for Gate 8: a historical
measurement of the time between a governance decision becoming executable
and its eventual onchain execution, for Compound Governor Bravo and Uniswap
Governor Bravo.

**Scope discipline (read this first):** this measures *timing*, not intent.
It does not claim why any delay happened, does not claim anyone forgot, and
does not claim Marked would have executed anything sooner. "Passed ≠
Executed" is an observable fact about the two datasets below; nothing about
*why* is asserted anywhere in this evidence.

## The metric

```
fulfillmentInterval = executedAt - executionEligibleAt
```

- `executionEligibleAt` is the Timelock `eta` recorded on the proposal
  (`proposals(id).eta`, cross-checked against the `ProposalQueued(id, eta)`
  event) — i.e. the first instant the proposal was legally executable. It is
  **not** proposal creation and **not** the queue transaction's timestamp.
  Using `eta` instead of queue time is what excludes the mandatory
  voting-period and timelock-delay from the measured interval — those delays
  are protocol-mandated, not the thing this baseline is measuring.
- `executedAt` is the block timestamp of the block containing the
  `ProposalExecuted(id)` event.

## Governors measured

| DAO | Governor (Bravo) address | Deployment block floor used for log scanning |
|---|---|---|
| Compound | `0xc0Da02939E1441F497fd74F78cE7Decb17B66529` | 12,006,099 |
| Uniswap | `0x408ED6354d4973f66138C91495F2f2FCbd8724C3` | 13,059,157 |

Both were verified live (not assumed) to be `GOVERNOR_BRAVO` family by
successfully calling `state()`, `proposals()`, and `initialProposalId()` —
the pipeline fails closed (excludes the DAO with a hard error) if any of
these probes doesn't behave like Bravo.

## Reproducing this dataset

```
pnpm reproduce:historical      # rebuilds evidence/historical/*.json (cache-first; add --refresh to force live RPC)
pnpm verify:historical         # independent recomputation of statistics.json from the committed dataset only
pnpm spot-check:historical     # manual/auditable spot-checks against a SECOND, different public RPC
```

`reproduce:historical` reads from `evidence/historical/raw/*.json` if
present, and only falls back to live RPC calls for whatever isn't cached —
pass `--refresh` to force a full live re-fetch. This makes the dataset
reproducible offline once the raw cache exists.

## Two discoveries made during reproduction (not assumed in advance)

### 1. The RPC `eth_getLogs` block-range limit

Scanning the full deployment-to-present block range for `ProposalExecuted`
and `ProposalQueued` events in one call fails immediately on viem's default
public mainnet RPC (`https://ethereum.reth.rs/rpc`) with "Invalid parameters
were provided to the RPC method." A binary search on block-range width
found the limit empirically: **100,000 blocks works, 107,031 blocks
fails.** The pipeline uses `LOG_CHUNK_BLOCKS = 80,000` (a safety margin
under the observed threshold) and scans in that many sequential chunks,
with retry-with-backoff and cached results per chunk.

### 2. The migration boundary (`initialProposalId`)

The Gate 8 instructions explicitly warned that a Governor could have gone
through a prior deployment, and that blindly assuming every historical
proposal ID belongs to the currently-live Governor contract could corrupt
the dataset. This turned out to be a **real, not hypothetical**, issue:
both Governors expose `initialProposalId()`, and it is nonzero for both:

- Compound: `initialProposalId() = 42`
- Uniswap: `initialProposalId() = 8`

This value is the last proposal ID that belonged to a **prior** Governor
deployment before the currently-live Bravo contract took over the
proposal-ID numbering. Proposal IDs `1..initialProposalId` on the current
contract's storage do not correspond to proposals actually created by *this*
contract, and reading `proposals(id)` for them returns meaningless/zeroed
data. These IDs are excluded with reason `MIGRATION_BOUNDARY`:

- Compound: 42 IDs excluded (1–42)
- Uniswap: 8 IDs excluded (1–8)

Total: 50 `MIGRATION_BOUNDARY` exclusions across both DAOs. This is
documented as an explicit exclusion reason (not silently dropped) in
`evidence/historical/exclusions.json`.

## Exclusion taxonomy

Every proposal ID considered is either included in the final dataset or
excluded with one of these documented reasons — never silently dropped:

| Reason | Meaning |
|---|---|
| `MIGRATION_BOUNDARY` | ID belongs to a prior Governor deployment (see above) |
| `NOT_SUCCEEDED` | Proposal did not pass (state = Defeated, or never reached quorum) |
| `NEVER_QUEUED` | Proposal succeeded but was never queued (no ETA was ever set) |
| `CANCELED` | Proposal was canceled at any stage |
| `EXPIRED` | Proposal was queued but expired before execution (Timelock grace period elapsed) |
| `QUEUED_AWAITING_EXECUTION` | Proposal is currently queued and not yet executed or expired (still pending as of the run date — not a timing data point yet) |
| `MISSING_CANONICAL_EVENT` | State says Executed but no matching `ProposalExecuted` log was found |
| `RPC_DATA_UNAVAILABLE` | An RPC read failed, or an event/state cross-check was inconsistent |
| `NEGATIVE_INTERVAL_INVALID` | Computed interval was negative (would indicate an internal data error — did not occur in this run) |

**Observed counts in this reproduction:** `MIGRATION_BOUNDARY` 50 (Compound
42, Uniswap 8), `CANCELED` 53 (Compound 37, Uniswap 16), `NOT_SUCCEEDED` 37
(Compound 33, Uniswap 4) — 140 excluded in total. Every other reason in the
taxonomy above (`NEVER_QUEUED`, `EXPIRED`, `QUEUED_AWAITING_EXECUTION`,
`MISSING_CANONICAL_EVENT`, `RPC_DATA_UNAVAILABLE`,
`NEGATIVE_INTERVAL_INVALID`) had **zero occurrences**: every non-canceled,
successful proposal outside the migration boundary was queued and
eventually executed cleanly, with its event data and current contract state
agreeing. This means there is no separate "unexecuted but eligible" cohort
to report for these two DAOs as of the run date — the optional cohort
analysis the Gate 8 instructions allow for (only if easy/reliable) turned
out to have nothing to show once actually checked, which is itself part of
the honest result, not a gap.

See `evidence/historical/exclusions.json` for the full per-DAO counts and
per-record detail.

## Percentile method

Linear interpolation between closest ranks: `rank = (p / 100) * (n - 1)`,
sorted ascending, interpolating between the floor and ceiling index. This
is the same method used by NumPy's default `np.percentile`. **Both**
`reproduce-historical-baseline.ts` (the primary aggregator) and
`verify-historical-baseline.ts` (the independent verifier) implement this
identically — documented here so neither script can silently drift from the
other's convention. The same applies to the bucket-boundary convention: the
four sub-24h buckets (`<5m`, `5m-1h`, `1h-6h`, `6h-24h`) partition `[0, 24h)`
mutually-exclusively via strict `<`; the three cumulative buckets (`>24h`,
`>48h`, `>7d`) use strict `>` (an interval of exactly 86,400s is *not*
counted in `>24h`).

## Independent verification architecture

Two code paths read the same normalized dataset but share zero aggregation
code:

```
raw RPC evidence (evidence/historical/raw/*.json)
        │
        ▼
reproduce-historical-baseline.ts  →  historical-governor-fulfillment.json, statistics.json
                                              │
                                              ▼
verify-historical-baseline.ts  (reads ONLY the two JSON files above,
                                 recomputes every statistic with its own,
                                 separately-written percentile/mean/bucket
                                 functions, and diffs against the committed
                                 statistics.json)
```

Running `pnpm verify:historical` against the committed dataset confirms:
**ALL STATISTICS MATCH** — every overall and per-DAO statistic (n, mean,
median, p75, p90, p95, max, min, all 7 buckets) recomputed independently
matches the committed `statistics.json` exactly.

## Spot-checks

`pnpm spot-check:historical` re-verifies five specific records against
canonical chain data using a **second, different public RPC endpoint**
(`https://eth.drpc.org`) than the one the primary pipeline used
(`https://ethereum.reth.rs/rpc`, viem's default). See
`evidence/historical/spot-checks.md` for the full write-up, including a
genuine discovery made during this process (a proposal whose queue/execute
transactions were routed through an intermediary relay contract rather than
sent directly to the Governor).

## Limitations

- Only Ethereum mainnet Compound and Uniswap Governor Bravo deployments are
  measured. No other Governor family, chain, or DAO is included.
- `QUEUED_AWAITING_EXECUTION` proposals are excluded from timing statistics
  by design — they have no `executedAt` yet, so including them would
  require assuming an end time. This is a separate cohort, not mixed into
  the executed-proposal percentiles.
- Proposal IDs before each Governor's `initialProposalId()` are entirely
  excluded (migration boundary) — no attempt was made to reconstruct the
  timing of the prior Governor deployment.
- Public RPC availability is a soft dependency: the primary pipeline caches
  raw evidence specifically so a fresh clone doesn't need a live, cooperative
  public RPC to reproduce the committed numbers.
