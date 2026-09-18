# Marked — Security

This is not marketing copy. Every claim below is either proven (with a pointer to the test/evidence that proves it) or stated as a known, current limitation. This document is fed directly by the Gate 12 hostile-audit findings (`evidence/system-audit/`) and is updated only once a fix is regression-tested — a finding is never described as fixed here before that.

## Threat model

Full actor/asset table: `evidence/system-audit/threat-model.md`. Summary of the actors that matter:

| Actor | What they can actually reach | Real risk |
|---|---|---|
| Unauthenticated visitor | Every static page; any job's full history by id (`GET /api/fulfillment/state`, intentionally public); the 4 agent Server Actions (rate-limited); a self-issued demo session (see Authentication below) | Read any job by id; after a trivial "login," mutate any job's demo state, including walking an ARMED job to `AWAITING_APPROVAL` via a real KeeperHub simulation; **cannot reach a real KeeperHub write** on this deployment — see Write-path boundary |
| Authenticated demo operator (self-issued) | ARM/APPROVE/DISARM on any job, plus the eligibility/simulation pipeline and (only if `MARKED_ENABLE_KEEPERHUB_EXECUTION=true`) real KeeperHub execution | Same technical reach as above — there are no privilege tiers in the current demo model |
| Compromised/malicious LLM output | Feeds the deterministic plan validator and rendered explanation text | Cannot mutate job state (every agent action is read-only, test-proven); cannot smuggle an authority-shaped field past the validator (the schema has no such field); has no import of `apps/web/src/lib/execution/*` at all |
| Concurrent callers/serverless workers | Any state-changing operation | ARM/APPROVE/DISARM and execution-claim races are both now CAS-protected (Gate 12/Gate 7); the KeeperHub dispatch path additionally uses `tryClaimExecution` plus KeeperHub's own `Idempotency-Key` as a second, independent safety net |

## Write-path boundary (the single most important fact for interpreting everything below — updated, read this even if you've read an older version)

**Corrected claim.** An earlier version of this document said the deployed web application had no code path capable of a real blockchain write. That is no longer true, and leaving it here uncorrected would be exactly the stale-documentation failure mode Gate 12 itself was built to eradicate. As of the KeeperHub execution-wiring task (`DECISIONS.md` DEC-030), `apps/web/src/lib/execution/approve-and-execute.ts` calls `packages/keeperhub`'s `executeContractCall` for real, reusing the exact client and semantics `scripts/gate5-keeperhub-execute.ts`'s offline proof already established.

**What actually bounds it today is a single, independent, default-off environment flag: `MARKED_ENABLE_KEEPERHUB_EXECUTION`.** It is unset on this deployment. When unset, `approveAndExecuteJob` throws `LiveExecutionDisabledError` before any state mutation and before any network call — verified by a regression test asserting zero `fetch` calls. This flag was deliberately introduced *separately* from `ENABLE_MAINNET_WRITE` (which `packages/keeperhub` already enforces per-chain) specifically because the Authentication section below (F-03) means any visitor who self-issues a demo session can call APPROVE — not a safe boundary to put a real write behind until that gap is closed. See `evidence/system-audit/findings.md` KEEPERHUB-WIRING-001 and `evidence/system-audit/keeperhub-execution-wiring.md` for the full trace, architecture, and security-invariant verification (every execution parameter is rebuilt server-side from the job's frozen commitment; the browser supplies only a job id; `KEEPERHUB_API_KEY` is read only in a server-only module never imported by a `"use client"` file).

**Read-only KeeperHub access (`simulateContractCall`) is reachable today, unconditionally** — it never broadcasts or moves value on any chain, by `packages/keeperhub`'s own documented invariant, so it is not gated by the flag above.

**Consequence**: several findings below that would be S0/S1 in a system that could execute are correctly S1/S2 here, because — **as long as `MARKED_ENABLE_KEEPERHUB_EXECUTION` stays unset** — impact remains bounded to internal state/audit-trail effects, not fund-loss or unauthorized execution. That flag is the entire remaining boundary; it is not defense in depth on top of "no path exists." Do not enable it without first closing F-03.

## Authority boundaries

See `docs/ARCHITECTURE.md` §4 for the full authority-separation model (Cactus / Governor / Agent / KeeperHub). The short version: Cactus identifies, the Governor authorizes, the agent only advises (structurally, via a schema with no authority field), KeeperHub only fulfills an already-frozen authorization by calling the Governor's own lifecycle entrypoint.

## Authentication scope — read this before trusting any "authenticated" claim elsewhere in this repository

Marked's auth is intentionally a demo session-token scheme, not SIWE/wallet auth. As of Gate 12:

- **The raw-header path** (`x-demo-token`/`x-actor-id`, used by direct API callers and the manual-entry demo sandbox) genuinely requires knowing `MARKED_DEMO_SESSION_TOKEN`. The comparison is constant-time (hardened Gate 12).
- **The cookie/UI login path** (`enterDemoWorkspace`, "Enter demo workspace") does **not** require the visitor to know that token at all. It mints a session whenever a non-empty display name is submitted and the server has *some* token configured — the client is never asked for it. This is deliberate, documented product intent (a judge should never need the real token), not an accidental bug. **Any visitor who reaches `/app` can obtain a fully "authenticated" session, with a self-chosen actor name, and mutate any job by id** (there is no per-job ownership check). See `evidence/system-audit/findings.md` F-03 for the full account and why it was not redesigned this gate.
- **Cookie flags**: `HttpOnly` always; `Secure` whenever `NEXT_PUBLIC_APP_ENV !== "development"` (fixed Gate 12 — was never set before); `SameSite=Lax`; session-only, explicitly cleared on logout.
- **A bare job id is never sufficient to mutate** — every mutation authenticates first, before any store access. A bare job id **is** sufficient to *read* that job (`GET /api/fulfillment/state`) — intentional, consistent with the product's "public evidence" framing.

**Do not describe this boundary as stronger than the above anywhere in this repository.** If a future gate genuinely closes the cookie-path gap (requiring real secret knowledge even for the UI flow), update this section and the corresponding README claim together, in the same commit as the fix and its regression test — never before.

## SSRF controls

The one user-controlled URL in the app (`/app/new`'s Cactus proposal URL) passes a strict `https:`-only, exact-hostname allowlist (4 fixed hosts) before any outbound fetch; the fetched URL is rebuilt from only `hostname`+`pathname`, discarding userinfo/query/fragment. Tested against: localhost/private-IP/link-local-metadata targets, `file:`/`data:`/`javascript:` schemes, embedded userinfo, mixed-case/lookalike/subdomain-confusion hostnames — all rejected. **Known, documented gap**: the SSR-fallback fetch follows redirects (`redirect: "follow"`) without re-validating the final destination against the allowlist — not an arbitrary-host SSRF (the *initial* target is still constrained to the 4 allowlisted hosts), but a real gap if one of those hosts ever issued a malicious redirect. See `evidence/system-audit/ssrf-audit.md` (finding F-11), not yet fixed.

## Secret handling

Server-only credentials (`DATABASE_URL`, `CACTUS_API_KEY`, `KEEPERHUB_API_KEY`, `OPENROUTER_API_KEY`/`ANTHROPIC_API_KEY`, `MARKED_DEMO_SESSION_TOKEN`, `GATE5_DEPLOYER_PRIVATE_KEY`) are never logged, never embedded in a user-facing error message, and never passed as a prop into a Client Component — traced case by case in `evidence/system-audit/secrets-dependency-env-audit.md`. Repo-wide and full-git-history secret scans (repeated after every gate, including this one) have found zero real secrets in the tracked repository, ever. `NEXT_PUBLIC_APP_ENV` is the only client-exposed variable, and it is a bare environment label, not a secret.

## LLM threat model

The model is treated as actively hostile input, not merely unreliable. Tested (via the schema's own structural design, not per-payload fuzzing): malformed/markdown-wrapped JSON, extra/unexpected keys (`.strict()` schema rejects them outright), authority-shaped field injection (`recipient`/`amount`/`target`/`calldata`/`governor`/`proposalId`/`chainId`/any hash — the schema has no such field, so the model cannot supply one no matter what it outputs), and prompt injection via proposal title/description/org name/user question (explicitly labeled untrusted to the model, and structurally irrelevant even if the model complies with an injected instruction, since nothing downstream of the model's text output can mutate state or trigger a blockchain call). The model cannot access its own API key through any code path found. Agent explanations are rendered as plain React children everywhere — zero `dangerouslySetInnerHTML`/`innerHTML`/`eval` anywhere in `apps/web/src` (verified by direct grep, zero matches).

**Public cost-abuse surface, fixed Gate 12**: the four agent Server Actions (most exposed: `askAboutReceipt`, reachable from the fully public `/proof/[id]` page) had zero rate limiting and zero input-length bound before Gate 12 — an anonymous caller could spend unlimited metered OpenRouter/Anthropic quota. Now capped at 2000 characters per question and 5 requests/60s per caller key. **Honestly documented limitation**: this is a per-serverless-instance, in-memory, best-effort limiter, not a distributed one — a cold start resets it, and traffic spread across warm instances each gets an independent budget. It meaningfully raises the cost of casual abuse; it is not a defense against a determined, distributed attacker. See `evidence/system-audit/findings.md` F-04.

## KeeperHub execution safety

`simulateContractCall`/`executeContractCall` are two structurally separate functions — no ambiguous `execute(call, { simulate: maybe })` pattern exists anywhere (grep-confirmed). `executeContractCall` sends a deterministic `Idempotency-Key` derived from the call itself. Caller authority is never assumed permissionless. As noted above, none of this is currently reachable from the deployed web app.

## Database safety

**High-priority Gate 12 fix**: the live-hosted-Postgres test files previously ran destructive operations (table-wide `DELETE`, `INSERT`, idempotent DDL) against whatever `DATABASE_URL` happened to be set and reachable, with no check that it was meant for this. `pnpm test` in an environment with a real, unrelated `DATABASE_URL` configured (a CI runner, a shared dev database) could have silently wiped it. **Fixed**: both live-Postgres test files now require a second, explicit `MARKED_ALLOW_DESTRUCTIVE_DB_TESTS=true` opt-in before opening a connection at all — verified in both directions. See `docs/TESTING.md` and `evidence/system-audit/database-audit.md`.

Migrations are additive-only (`CREATE TABLE IF NOT EXISTS`/`CREATE INDEX IF NOT EXISTS`, zero `DROP`/`TRUNCATE` anywhere in `packages/db/migrations/`), never run automatically at app startup or build time, never log the connection string, and require `DATABASE_URL` to be explicitly set (no default/guessed connection).

## Concurrency / idempotency

See `docs/ARCHITECTURE.md` §20. Fixed Gate 12: ARM/APPROVE/DISARM now use a real compare-and-set, closing a genuine race where two concurrent mutations from the same read snapshot could both "succeed" (duplicating an audit event, or silently overwriting one caller's outcome). No exactly-once execution claim is made anywhere in this project.

## Recovery

See `docs/ARCHITECTURE.md` §21. The recovery classifier's return type structurally excludes blind resubmission. Not live-exercised against real infrastructure this gate (would require an actual KeeperHub call).

## Postcondition verification

See `docs/ARCHITECTURE.md` §23. `ERC20TransferAdapter`'s existing, extensive test suite (650 lines) covers essentially every named attack: wrong token/recipient/amount, off-by-one deltas, missing/ambiguous logs, fee-on-transfer- and rebasing-shaped mismatches — all fail closed, none approximated. Re-verified, not re-derived, this gate.

## Finality

Sepolia proofs use a stated 2-confirmation threshold, explicitly labeled as a policy for that controlled proof, never generalized to mainnet. Real reorg behavior not live-tested (would require a real or forked-chain reorg).

## Known limitations (as of Gate 12)

- The demo login's cookie path provides no real secret-knowledge gate (see Authentication above) — open, pending a product decision, not a hidden bug.
- SSR-fallback Cactus fetch does not re-validate redirect destinations against its host allowlist.
- No Content-Security-Policy (four other safe headers — `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` — were added Gate 12; a CSP needs real browser testing this project has not yet run against Next.js's own inline hydration injection).
- `next@15.5.25` bundles an internal, hard-pinned `postcss@8.4.31` with known CVEs (source-map path traversal, CSS-stringify XSS) — build-time only, not reachable at runtime by this app; no same-line Next.js patch exists yet.
- No fetch timeout on Cactus or LLM-provider requests (bounded only by the platform's own default).
- The `x-demo-token` header path has no explicit lockout/backoff (mitigated by the constant-time comparison and token entropy, not eliminated).

## Reporting vulnerabilities

This is a hackathon submission, not a product with a public bug-bounty program. If you find a security issue in this repository, open a GitHub issue on `https://github.com/TheWeirdDee/marked` describing it — do not include a real, exploitable secret value in the issue itself. There is no other disclosure channel at this time.
