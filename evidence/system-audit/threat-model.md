# Gate 12 §5 — threat model

## Actors and what they can actually reach

| Actor | Reach | Real risk |
|---|---|---|
| Unauthenticated visitor | Every static/marketing page; `GET /api/fulfillment/state?jobId=` (any job, by id); the 4 agent Server Actions (now rate-limited, F-04); `/app` (can self-issue a session per F-03) | Read any job's full history by id (job ids are deterministic/derivable, `jobIdForCoordinate`); after a trivial "login," mutate any job's demo state; cannot reach any real blockchain effect (F-06) |
| Authenticated demo operator (self-issued, per F-03) | Everything above, plus ARM/APPROVE/DISARM on any job | Same as above; the "authentication" step is mostly an audit-trail attribution + UX-friction gate, not a privilege boundary, given F-03/F-06 |
| Malicious operator | Same technical reach as above (no privilege tiers exist) | Could flood the audit trail with fake actor names, or race another operator's DISARM (mitigated, F-01) |
| Compromised/malicious LLM output | Feeds `validateAgentPlan` (deterministic) and rendered explanation text | Cannot mutate job state (LLM calls are read-only, proven); cannot smuggle authority-shaped fields past the validator (Gate 10's own adversarial suite, re-spot-checked this gate); rendered as plain React children, not raw HTML (no XSS vector found) |
| Malicious proposal description (prompt injection via Cactus data) | Reaches the LLM as untrusted context (explicitly labeled as such, Gate 10) | Same containment as above — the deterministic validator, not the model's own good behavior, is the actual boundary |
| Malformed Cactus page | `packages/cactus`'s SSR fallback parser | Typed `CactusResolutionError`, never a raw-text fallback to unvalidated coordinates (verified) |
| Compromised external API response (Cactus/RPC/KeeperHub) | Each has its own boundary (see `trust-boundaries.md`) | Governor RPC is the actual authority source and is independently re-read at ARM time — a compromised Cactus response cannot forge an authorization |
| Concurrent serverless workers | Any state-changing operation | F-01 fixed the one gap found (ARM/APPROVE/DISARM); execution-claim CAS (`tryClaimExecution`) was already proven in Gate 7/11 and remains sound, though currently unreachable from the live app (F-06) |
| RPC inconsistency (reorg, disagreement) | Governor reads | Out of this gate's live-testable scope (needs a real reorg); see `finality-audit.md` for what's documented vs. what's provable without one |
| Database outage | Every store operation | Fails closed with typed `PersistenceUnavailableError`, never silently substitutes SQLite (Gate 11, re-confirmed) |
| KeeperHub timeout | N/A on the live app (unreachable, F-06); proof scripts only | Out of scope for a zero-write audit |
| External executor (someone else executes the proposal first) | Detected at `VERIFYING_LIFECYCLE` → `FULFILLED_EXTERNALLY_VERIFIED`/`_UNVERIFIED` (state machine, proven reachable) | Treated as user success per PRD Invariant 10, not raced against |
| Accidental operator double-submit | ARM/APPROVE/DISARM double-click | Fixed by F-01 (CAS) |

## Assets and what actually protects them

| Asset | Real protection |
|---|---|
| Governance authorization integrity | Independent on-chain re-read at ARM time (`refreshAuthorizationHash`), never the frozen commitment's own hash treated as current |
| Frozen commitment | `computeFulfillmentCommitmentHash` recomputed and compared before ARM; any drift refuses (`ArmRefusedError`) |
| Approval | Bound to the exact frozen commitment hash (`ApprovalHashMismatchError` on mismatch) — "I approve this exact commitment," never "execute whatever is current" |
| Execution identity | `tryClaimExecution`'s request-hash-as-PRIMARY-KEY CAS (proven sound, currently unreachable from the live app) |
| KeeperHub/OpenRouter/database credentials | Server-only env vars; grep-confirmed never logged, never in any tracked file, never passed to a Client Component (see `secrets-audit.md`) |
| Session token | Never sent to the browser in any form (cookie carries only `"1"`); see F-03 for the separate finding about how trivially a session is obtained regardless |
| Receipt integrity | `computeReceiptHash`'s existing, extensive mutation-sensitivity test suite (re-verified this gate, not re-derived — see `receipt-audit.md`) |
| Audit history | Append-only event log; F-01 closed the one duplication gap found |
| Economic postcondition | `ERC20TransferAdapter`'s existing, extensive attack-surface test suite (re-verified this gate — see `postcondition-audit.md`) |
| Public evidence | Static JSON committed under `evidence/`; canonical hashes re-verified unchanged this gate (`pnpm verify:gate6`, `pnpm verify:historical`) |

This is deliberately not a generic STRIDE enumeration — every row above is scoped to what this specific codebase actually does, verified by reading the code, not assumed from the architecture diagram.
