# Gate 12 §42A — documentation consistency audit

Performed after every code fix and regression pass, not before — README and `docs/` were rebuilt from the final, post-fix code, per the explicit instruction that documenting behavior before it stabilizes risks beautifully describing something that changes ten minutes later.

## README problems found before this pass

1. **A direct, internal self-contradiction.** README's Gate 11 status line (line 81 of the prior version) correctly stated the hosted Neon Postgres proof passed 60/60. The "What is not yet true" section, four sections later in the same file (line 116 of the prior version), still read: *"The `PostgresFulfillmentJobStore` production adapter has not been exercised against a real hosted (or local/containerized) Postgres instance in this environment — its test suite is honestly skipped, not passing, pending a user-supplied `DATABASE_URL`."* These two claims cannot both be true. This is exactly the class of drift a whole-document rebuild is meant to eliminate, not a one-line patch — the old file's structure (a running status list plus a separately-maintained "not yet true" list, edited independently across gates) made this kind of drift structurally likely to recur even if this one instance were patched.
2. **The auth claim was stronger than Gate 12 proved.** "An authenticated mutating boundary with a real UX — ARM/APPROVE/DISARM require a real authenticated actor" did not, on its own, disclose that the cookie/UI login path requires no real secret knowledge (Gate 12 finding F-03). The sentence was not technically false (a session IS required, and IS real in the sense that it gates the mutation and records a real actor string), but it invited a reader to assume more rigor than exists. Corrected in the new README's Security Model section, with an explicit "read this before trusting an older statement" framing.
3. **`packages/db`'s repository-structure line described only SQLite** ("`SqliteFulfillmentJobStore` — real file-backed persistence (Gate 7); local-filesystem only") with no mention of `PostgresFulfillmentJobStore` at all, despite Gate 11 having built and proven it. Not technically false (SQLite-first description), but materially incomplete for a reader trying to understand the current persistence architecture from README alone.
4. **No architecture, security, operations, or testing documentation existed beyond README and `evidence/` gate write-ups.** A security reviewer or new developer had to reconstruct the system's authority model, trust boundaries, and test-safety rules from source and scattered evidence files — there was no single document that would let someone assess Marked's security posture without reading `packages/core`, `packages/db`, `packages/keeperhub`, and `packages/cactus` directly.
5. **No blockchain-write-path claim was stated prominently or early enough.** The fact that the deployed web app cannot execute a real transaction at all is the single most important piece of context for interpreting the rest of the security posture, and it was not stated anywhere in README before this rebuild.

## Stale-claim sweep (the specific forbidden patterns named in this task)

Grepped `CLAIMS.md`, `GATES.md`, `packages/db/README.md`, `VERCEL_ENVIRONMENT.md`, and the (now-rebuilt) `README.md` for each of the following. None were found as live, uncorrected claims — every match was either an accurate historical reference (explicitly framed as past-tense/superseded) or an explicit disclaimer already correctly stating the limitation:

| Forbidden pattern | Found as a live stale claim? |
|---|---|
| "hosted Postgres is untested" | No — only the one README self-contradiction above, now fixed |
| "packages/db is SQLite-only" | No — only accurate historical references ("previously SQLite-only") |
| "DATABASE_URL is unused" | No |
| "auth is stronger than the actual implementation" | Yes — README's auth claim, corrected (see item 2 above) |
| "Cactus GraphQL is being used [as the default]" | No — `CLAIMS.md` already correctly labels the GraphQL path `BLOCKED_CACTUS_CREDENTIAL` and the public-page path as what's actually resolved |
| "Cactus is simulated" | No — every existing reference correctly states the SSR fallback is a real live HTTP request |
| "Cactus and Gate 5 are one continuous proof" | No — Mode C / DEC-015 is consistently and correctly stated as a split proof everywhere it's mentioned |
| "agent can execute" | No — every reference to the agent boundary correctly states it cannot |
| "successful transaction alone creates MARKED ✓" | No |
| "KeeperHub Workflows are the v1 execution surface" | No — `GATES.md`/`CLAIMS.md` correctly state Option B (direct contract-call) only, Option A untested |

## Missing architecture documentation (now created)

- `docs/ARCHITECTURE.md` — 34 sections: system overview, design goals/non-goals, authority model, three-truth model, component architecture (with a Mermaid diagram), package boundaries, Cactus resolution, Governor authorization, canonical hashing, fulfillment commitment, state machine (with a Mermaid state diagram), human authorization, agent boundary, KeeperHub execution, caller authority, simulation, idempotency, persistence, concurrency, unknown-outcome recovery, finality, postcondition verification, receipt generation, authentication boundary, SSRF/network boundary, secret handling, deployment architecture, failure taxonomy, supported/unsupported semantics, Mode C topology, extension points, security invariants, reproduction/evidence map.
- `docs/SECURITY.md` — threat model, the write-path boundary (stated first, since it bounds everything else), authority boundaries, authentication scope (with the corrected claim), SSRF controls, secret handling, LLM threat model, KeeperHub execution safety, database safety, concurrency/idempotency, recovery, postcondition verification, finality, a known-limitations list, and a vulnerability-reporting note.
- `docs/OPERATIONS.md` — production environment, Postgres, migrations, startup, per-dependency failure-behavior table, recovery, outage behavior per external dependency, secret rotation, deployment steps, rollback, evidence/receipt verification commands, incident rules, and an explicit "what operators must never manually bypass" list.
- `docs/TESTING.md` — test taxonomy table, commands, a full per-command external-dependency table (network/DB/LLM key/KeeperHub key/blockchain credential), the hosted-DB-test-isolation rule (Gate 12's own safety fix, restated here as the primary audience for this exact document), no-write guarantees, repeated/flaky-test policy, and proof-reproduction commands.

## Diagrams added

Six Mermaid diagrams in README.md, as required: system architecture (flowchart), three-truth reconciliation (flowchart), execution sequence (sequence diagram), state machine (state diagram, generated by reading `packages/core/src/fulfillment-state-machine.ts` directly — not reconstructed from memory or the PRD), failure/recovery path (flowchart, alongside the original text-block illustration, kept because it's a clearer first read), and trust boundaries (flowchart). `docs/ARCHITECTURE.md` additionally carries its own component-architecture and three-truth-model Mermaid diagrams (3 total there), for a document that stands on its own without requiring README to be open alongside it. Every diagram was checked against the actual source it describes; none is decorative. The state diagram specifically omits five terminal refusal/block edges out of `SIMULATING`/`EXECUTING` for visual readability — the omission is called out explicitly in the surrounding text, with a pointer to the source file as ground truth, rather than silently simplified.

**Self-correction during this same pass**: an earlier draft of this file claimed a Mermaid version of the failure/recovery diagram existed in `docs/ARCHITECTURE.md` §21 when it did not — only a text block did. Caught by re-checking the actual file content against this document's own claim before finalizing, rather than trusting the earlier draft. The Mermaid diagram was then genuinely added (to README, where the 6-diagram requirement lives), and this paragraph corrected to match.

## Sections added to README (per the required structure)

All 33 required sections are present: product identity, the problem (with the exact Gate 8 numbers and their explicit non-claims), what Marked does (13-step flow), system architecture, the three truths, Cactus integration (including the paused-DAO-registration limitation), Governor authorization engine, fulfillment commitment, agent boundary, KeeperHub execution, execution sequence, state machine, failure and recovery model, economic postcondition verification, Marked Receipt (with the real, safe, canonical Gate 6 values), persistence architecture, security model (with the corrected auth claim), trust boundaries, repository structure (per-package purpose/authority/must-never), web routes (every actual route, re-derived from `find apps/web/src/app`, not the prior static list), environment variables (quick-start table only, pointing to `VERCEL_ENVIRONMENT.md` for the full matrix), local development, database development, testing strategy, evidence/reproducibility (claim → status → evidence → reproduce table), canonical proof, Mode C / current limitations, decision records, development laws, documentation index, deployment, FAQ, license.

## Claims corrected

1. README's Gate 11 self-contradiction (item 1 above) — resolved by the rebuild; no "not yet exercised" language survives anywhere in the new README.
2. README's auth claim (item 2 above) — corrected with an explicit pointer to the real limitation and to `evidence/system-audit/findings.md` finding F-03.
3. README's persistence description — now documents both backends and the Gate 12 destructive-test-safety fix, not SQLite alone.

## Docs created

`docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/OPERATIONS.md`, `docs/TESTING.md` (all new), plus `DECISIONS.md`'s new `DEC-029` recording this rebuild itself as an architectural/documentation decision, per this project's own "every material change is recorded in DECISIONS.md" discipline.

## Source files cross-checked while writing this documentation

`packages/core/src/{status,fulfillment-state-machine,fulfillment-job,fulfillment-commitment,receipt,agent-plan,auth,fulfillability}.ts`, `packages/db/src/{fulfillment-job-store,postgres-fulfillment-job-store,live-postgres-test-guard}.ts`, `packages/keeperhub/src/client.ts`, `packages/cactus/src/url.ts`, `apps/web/src/app/app/actions.ts`, `apps/web/src/lib/{session,fulfillment-actions,job-store}.ts`, `apps/web/src/lib/agent/{actions,provider,rate-limit}.ts`, every route file under `apps/web/src/app`, `BUILD_CONTRACT.md`, `DECISIONS.md`, `evidence/marked-receipt/receipt.json`, `evidence/production-persistence/hosted-production-proof.md`, and every file under `evidence/system-audit/` produced earlier in Gate 12.

## Remaining documentation limitations

- `docs/ARCHITECTURE.md` §32 (extension points) notes but does not fully specify what wiring real KeeperHub execution into the live app would require — that is a future gate's design work, not something this documentation pass should invent.
- The in-app `/docs` route (`apps/web/src/lib/docs-content.ts`) was not independently audited for staleness this pass — README's documentation index now clearly distinguishes it from the repo-root `docs/` directory, but its own content was out of scope for this specific consistency sweep.
- No claim in this documentation set has been read by an actual hackathon judge, new developer, security reviewer, KeeperHub reviewer, or Cactus reviewer — "does this actually serve those five audiences" is asserted by design intent and structure, not by user testing.
