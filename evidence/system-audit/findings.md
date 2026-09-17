# Gate 12 — findings

Severity model: S0 catastrophic, S1 critical, S2 high, S3 medium, S4 low (exact definitions in the Gate 12 prompt §51, reproduced in `gate12-result.md`). Status values: `FOUND` → `FIXED` → `VERIFIED`, or `ACKNOWLEDGED` when a finding is real, understood, and intentionally not changed because doing so would require a scope/architecture change outside this gate's authority.

---

## F-01 — TOCTOU race in ARM/APPROVE/DISARM: two concurrent mutations from the same read snapshot could both silently "succeed," duplicating events or overwriting each other's outcome

**SEVERITY: S2 (high)**
**SUBSYSTEM:** `apps/web/src/lib/fulfillment-actions.ts`
**ASSUMPTION:** "Only one ARM/APPROVE/DISARM request will ever be in flight for a given job at a given moment" — never stated explicitly, but implicit in using an unconditional upsert (`saveJobAndEvents`) for a decision computed from a job snapshot read moments earlier.
**REPRODUCTION:** Two genuinely independent `SqliteFulfillmentJobStore` instances on the same file; `Promise.all([disarmDemoJob(storeA, ...), disarmDemoJob(storeB, ...)])` racing DISARM against the same ARMED job. See `apps/web/src/lib/fulfillment-actions.test.ts`, "Gate 12: two concurrent DISARM calls..." and "...a concurrent APPROVE and DISARM racing from AWAITING_APPROVAL...".
**OBSERVED (before fix):** Both calls returned success (no error). The event log gained TWO `DISARMED` events for one user intent. In the APPROVE/DISARM race, whichever write landed last silently won — the loser's caller was told "success" while their action had no lasting effect and nothing told them so.
**EXPECTED:** Exactly one of two racing mutations from the same snapshot may apply; the other must be refused with a clear "this changed underneath you" error.
**ROOT CAUSE:** `armJob`/`disarmJob`/`approveJob`/`armDemoJob` called `store.saveJobAndEvents(nextJob, [event])` — an unconditional `INSERT ... ON CONFLICT DO UPDATE` — instead of `store.saveWithCas(nextJob, [event], job.status)`, the compare-and-set primitive Gate 11 built and proved for exactly this purpose but which was never actually wired into the application's own mutation path.
**IMPACT:** No fund-loss or unauthorized on-chain execution is possible through this path today — see F-06 (the live web app never actually calls KeeperHub; ARM/APPROVE/DISARM only move an internal status). The real impact is audit-trail integrity (duplicate events misrepresenting what happened) and a human safety property (a DISARM intended to stop a job could be silently overwritten). This matters more once execution actually gets wired into the live app (a natural next step), so it was fixed now while cheap rather than deferred.
**FIX:** All four call sites now use `store.saveWithCas(nextJob, [event], job.status)` via a new `saveWithCasOrThrow` helper, throwing `ConcurrentJobModificationError` when the CAS loses.
**REGRESSION TEST:** `apps/web/src/lib/fulfillment-actions.test.ts` — two new tests, both using genuinely independent store instances raced via `Promise.all` (not sequential awaits), asserting exactly one caller succeeds, exactly one event/outcome is recorded, and the loser receives `ConcurrentJobModificationError`.
**STATUS: FIXED, VERIFIED** (reproduced failing before the fix, passing after, re-run clean in full regression).
**EVIDENCE:** `evidence/system-audit/concurrency-audit.md`.

---

## F-02 — `pnpm test` could destructively wipe whatever database `DATABASE_URL` points at, with no confirmation that it's a disposable test database

**SEVERITY: S1 (critical)**
**SUBSYSTEM:** `packages/db/src/postgres-fulfillment-job-store.contract.test.ts`, `packages/db/src/postgres-fulfillment-job-store.hosted.test.ts`
**ASSUMPTION:** "Whatever `DATABASE_URL` is set in this environment when tests run is always disposable and dedicated to this test suite." True in Gate 11's own development flow; not a safe general assumption — a CI runner or developer machine could have a real `DATABASE_URL` set for an unrelated reason (a deployment preview, an already-migrated shared dev database).
**REPRODUCTION (of the risk, not of actual data loss):** Before the fix, running `DATABASE_URL=<any reachable Postgres> pnpm test` from `packages/db` unconditionally executed `DELETE FROM job_events`, `DELETE FROM execution_claims`, `DELETE FROM fulfillment_jobs` before every contract test, and multiple `INSERT`/idempotent-DDL statements from the hosted test file — with no check of any kind on what that database was for.
**EXPECTED (Gate 12 §33's own explicit bar):** Explicit test-mode opt-in, an identifiable test database/schema, a guard before destructive cleanup.
**ROOT CAUSE:** The Gate 11 `resetBeforeEach` hook and the hosted test file's direct table writes were gated only on "is `DATABASE_URL` set and reachable," never on any second signal that the target database is meant for this.
**FIX:** New `packages/db/src/live-postgres-test-guard.ts` — `checkDestructiveDbTestGuard()` requires BOTH `DATABASE_URL` set AND `MARKED_ALLOW_DESTRUCTIVE_DB_TESTS=true` (exact string) before either live test file so much as opens a connection. Without the second flag, every test in both files reports an explicit, descriptive `it.skip`, never a silent pass and never a connection attempt.
**REGRESSION TEST:** Manually verified both directions: `DATABASE_URL` set without the flag → all 5 test files (2 Postgres + 3 SQLite/in-memory) report skip for the Postgres ones with the guard's exact reason text; `DATABASE_URL` + `MARKED_ALLOW_DESTRUCTIVE_DB_TESTS=true` → the suite runs for real against the hosted database (16/17 passed in one run, one flaked on Neon cold-start latency — a known, already-documented characteristic, not a new bug).
**STATUS: FIXED, VERIFIED.**
**EVIDENCE:** `evidence/system-audit/database-audit.md`.

---

## F-03 — The cookie-based "Enter demo workspace" login provides no real secret-knowledge gate; the token check is a server-side self-comparison

**SEVERITY: S1 by the letter of the severity model ("auth bypass for mutation" is a named S1 example) — see mitigating context below before treating this as equivalent to a production auth bypass.**
**SUBSYSTEM:** `apps/web/src/app/app/actions.ts` (`enterDemoWorkspace`), `apps/web/src/lib/session.ts` (`sessionAuthParams`), `packages/core/src/auth.ts` (`requireAuthenticatedActor`).
**ASSUMPTION (the code's own doc comments state this is INTENTIONAL, not a bug):** "A judge never sees or types `MARKED_DEMO_SESSION_TOKEN`... they type a display name" (`actions.ts:13-14`). The mechanism: `enterDemoWorkspace` mints a session cookie (`SESSION_COOKIE="1"`) whenever a non-empty name is submitted AND the server has some token configured — it never asks the client for that token. Later, `sessionAuthParams()` reads the session flag and, if set, supplies `providedToken = process.env["MARKED_DEMO_SESSION_TOKEN"]` — i.e. the server compares its own env value against itself. The `!==`/now constant-time comparison in `requireAuthenticatedActor` can never fail for a request that went through this cookie path.
**REPRODUCTION:** Read `apps/web/src/app/app/actions.ts:19-29` and `apps/web/src/lib/session.ts:24-28` directly — no exploit needed; this is the code's literal, documented behavior. Confirmed independently by direct file reads, not solely by the investigating subagent's report.
**OBSERVED:** Any visitor who reaches `/app` can obtain a fully "authenticated" session, with an arbitrary self-chosen `actor` name (recorded permanently on every event they cause), without ever knowing the real `MARKED_DEMO_SESSION_TOKEN`. Because there is no per-job ownership check anywhere in `armJob`/`disarmJob`/`approveJob`, that session can ARM/APPROVE/DISARM **any** job by id — including one a different visitor resolved — not just a self-created one.
**WHY THIS IS NOT BEING TREATED AS A BLOCKING S0/S1 REQUIRING A REDESIGN:**
1. It is a **documented, deliberate hackathon-demo UX decision** (Gate 7/9R), not a bug slipped in unnoticed — the code's own comments state the intent plainly.
2. The demo dashboard (`/app`, `store.listJobs()`) already shows every job to every "logged in" visitor by design — this is architected as a shared sandbox, not a private per-user workspace, so "any authenticated visitor can act on any job" is consistent with (not a violation of) the product's own apparent intent.
3. **Most importantly: it cannot reach a real, unauthorized blockchain effect.** Per F-06, the deployed web app has no code path to KeeperHub's `executeContractCall` at all — ARM/APPROVE only move an internal status. The actual authority boundary (Governor re-verification before ARM, KeeperHub/Governor's own on-chain caller checks were execution ever wired in) is independent of this session check and unaffected by it.
4. A "real" fix (requiring the visitor to actually know the secret token) would directly contradict the product's own stated design goal ("a judge never sees or types the token") — i.e. it is a scope/product change, which Gate 12's own fix policy (§53) says to document and refer to the user rather than silently change.
**NARROW, SAFE IMPROVEMENTS APPLIED (do not change the core design, reduce adjacent risk):**
- `Secure` cookie flag was previously never set on either auth cookie (real gap, unrelated to the tautology above) — now set whenever `NEXT_PUBLIC_APP_ENV !== "development"`.
- Token comparison changed from a plain `!==` to a constant-time comparison (relevant to the one path — the raw `x-demo-token` header path — where a real secret is actually being compared).
**WHAT WAS NOT CHANGED, AND WHY:** The core "type a name, get a session" flow. Changing it is a product-scope decision, not a narrow security fix — see "Exact user decision required" in `gate12-result.md`.
**STATUS: ACKNOWLEDGED** (the two narrow sub-fixes: FIXED, VERIFIED; the core design question: open, requires the user's decision).
**EVIDENCE:** `evidence/system-audit/auth-audit.md`.

---

## F-04 — Public, unauthenticated agent/LLM Server Actions had no rate limit and no input-length bound — a real, exploitable API-cost-abuse vector

**SEVERITY: S2 (high)**
**SUBSYSTEM:** `apps/web/src/lib/agent/actions.ts` — all four exported Server Actions, most acutely `askAboutReceipt` (reachable from the fully public `/proof/[id]` page with zero login).
**ASSUMPTION:** None stated; simply absent. Confirmed via direct grep: no rate-limiting code, no `middleware.ts`, anywhere in `apps/web` before this fix.
**REPRODUCTION:** Called `askAboutFulfillment` six times in under a second from the same caller key in a test — all six previously would have reached the (mocked) provider; a sufuciently long `question` string had no cap either.
**OBSERVED (before fix):** Unlimited anonymous calls, each spending real metered OpenRouter/Anthropic quota, with no per-request or per-window limit, and no cap on `question` length (itself a cost lever — a very long prompt costs more).
**EXPECTED:** A real, previously-documented known-limitation ("public receipt Q&A lacked rate limiting") should either no longer exist, or should be confirmed and fixed, per the Gate 12 prompt's explicit instruction not to hide a cost-abuse vulnerability.
**FIX:** New `apps/web/src/lib/agent/rate-limit.ts` — a 2000-character question cap, and a 5-requests-per-60-seconds sliding window keyed by the caller's forwarded IP (falling back to a shared fixed key, never to "unlimited," when no IP is available). Wired into all four Server Actions via one `guardAgentRequest` chokepoint in `actions.ts`.
**HONEST LIMITATION (documented, not hidden):** This is a per-serverless-instance, in-memory limiter — not a distributed one. A cold start resets it; traffic spread across many warm instances each get an independent budget. It meaningfully raises the cost of casual/naive abuse; it is not a defense against a determined, distributed attacker. A production deployment expecting real adversarial traffic would need a shared store (Vercel KV/Upstash) — deliberately not introduced here per the "no new paid infrastructure" instruction.
**REGRESSION TEST:** `apps/web/src/lib/agent/rate-limit.test.ts` (6 unit tests on the limiter itself) + two new integration tests in `apps/web/src/lib/agent/actions.test.ts` proving the guard is actually wired in end-to-end (a too-long question and a 6th-in-window request are both refused before the mocked provider is ever called).
**STATUS: FIXED, VERIFIED.**
**EVIDENCE:** `evidence/system-audit/abuse-audit.md`.

---

## F-05 — `.claude/scheduled_tasks.lock` and root `.mcp.json` were untracked but NOT covered by any `.gitignore` rule

**SEVERITY: S3 (medium)** — no secret was actually present in either file at the time of this audit (verified by direct read), but both are exactly the kind of file that could accidentally be staged by a future broad `git add` and are the kind of local tooling config that commonly grows a credential field later.
**SUBSYSTEM:** `.gitignore`, `.claude/`, `.mcp.json`.
**OBSERVED:** `.claude/settings.local.json` was already ignored by name; `.claude/scheduled_tasks.lock` (a session pid/timestamp lock file) and root `.mcp.json` (an MCP server config, currently only a bare KeeperHub URL) had no ignore rule at all.
**FIX:** Added explicit `.gitignore` entries for both, named individually (not a blanket `.claude/` ignore, in case this project later wants to track shared `.claude/` content).
**REGRESSION TEST:** `git status --short` before/after confirmed both files disappear from the untracked list once the rule was added.
**STATUS: FIXED, VERIFIED.**
**EVIDENCE:** `evidence/system-audit/git-security.md`.

---

## F-06 — Positive finding, not a defect: the deployed web app has ZERO code path capable of a real blockchain write

**SEVERITY: N/A — this is a confirmed-safe finding, recorded because it materially changes the severity assessment of F-01 and F-03 above.**
**REPRODUCTION:** Repo-wide grep (excluding node_modules/.git) for `sendTransaction`, `writeContract`, `signTransaction`, `privateKeyToAccount`, `eth_sendRawTransaction`, `eth_sendTransaction`, `walletClient`, `createWalletClient` returns exactly one match anywhere in the repository: `scripts/gate5-deploy-and-queue.ts` (a one-time proof script). A second grep for every importer of `packages/keeperhub`'s `executeContractCall` (the one function capable of triggering a real KeeperHub-mediated Governor execution) returns only: its own definition/tests, `packages/keeperhub/src/index.ts`'s barrel export, and two proof scripts (`scripts/gate5-keeperhub-execute.ts`, `scripts/prove-keeperhub-seam.ts`). **Zero occurrences under `apps/web/src`.**
**CONFIRMS:** `tryClaimExecution` (Gate 7's execution-claim CAS) is also never called anywhere in `apps/web` (grep-confirmed) — consistent with the same conclusion: the live web app's ARM→APPROVE flow computes and persists an internal `EXECUTING` status but never actually dispatches to KeeperHub. The real KeeperHub-mediated execution this project proved (Gate 5's receipt, tx `0x49ac3ebbd7e957cb8b57e0e1dcc0e2e24243b2ae72c34cc1b839c7fe8a81d7cb`) was performed exclusively by the offline proof script, never by the deployed app.
**ALSO CONFIRMS:** No ambiguous `execute(call, { simulate: maybe })` pattern exists — `simulateContractCall` and `executeContractCall` (`packages/keeperhub/src/client.ts`) are two structurally separate exported functions, never one function with a boolean simulate-or-not flag.
**STATUS: VERIFIED (confirmatory finding).**
**EVIDENCE:** `evidence/system-audit/write-path-map.md`, `evidence/system-audit/keeperhub-audit.md`.

---

## F-07 — Malformed `DATABASE_URL` bypassed the typed `PersistenceError` taxonomy

**SEVERITY: S3 (medium)** — the leaked error (`TypeError: Invalid URL`) does not itself disclose the connection string or credentials, so this is a consistency/error-taxonomy gap, not a secret-disclosure vulnerability.
**SUBSYSTEM:** `packages/db/src/postgres-fulfillment-job-store.ts`.
**REPRODUCTION:** `new PostgresFulfillmentJobStore("not-a-valid-connection-string")` — porsager/postgres's constructor throws synchronously (`TypeError: Invalid URL`), and this class's constructor had no try/catch, so the raw driver error propagated past the documented `PersistenceConfigurationError`/`PersistenceUnavailableError` taxonomy every caller is supposed to be able to rely on.
**FIX:** Constructor now wraps the `postgres(...)` call and re-throws as `PersistenceConfigurationError`, with a message confirmed (by test) to never contain the original invalid value.
**REGRESSION TEST:** `packages/db/src/postgres-fulfillment-job-store.malformed-url.test.ts` — 2 tests, no live database needed.
**STATUS: FIXED, VERIFIED.**
**EVIDENCE:** `evidence/system-audit/env-audit.md`.

---

## F-08 — An explicitly-set but unrecognized `MARKED_AGENT_PROVIDER` value silently fell through to auto-select, masking a misconfiguration

**SEVERITY: S3 (medium)** — inconsistent with this project's own established no-silent-fallback discipline (DEC-013, DEC-024); does not itself expose a secret or bypass an authority check.
**SUBSYSTEM:** `apps/web/src/lib/agent/provider.ts`.
**REPRODUCTION:** `MARKED_AGENT_PROVIDER=opentrouter` (typo of "openrouter") with both `OPENROUTER_API_KEY` and `ANTHROPIC_API_KEY` present — matched neither of the two known-literal branches and fell through to the same auto-select path as an unset variable, silently using OpenRouter (or whichever key existed) with no indication the operator's explicit selection was ignored.
**FIX:** `getAgentProvider()` now treats "set, but neither known value" as `null` (agent unavailable) rather than "no preference" — consistent with how a recognized-but-unavailable selection already behaved.
**REGRESSION TEST:** New case added to `apps/web/src/lib/agent/provider.test.ts`.
**STATUS: FIXED, VERIFIED.**
**EVIDENCE:** `evidence/system-audit/env-audit.md`.

---

## F-09 — Zero security headers configured anywhere (no CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS)

**SEVERITY: S3 (medium)**
**SUBSYSTEM:** `apps/web/next.config.ts`.
**REPRODUCTION:** `next.config.ts` had no `headers()` function; no `middleware.ts`; no root/`apps/web` `vercel.json`. A real request to a locally-built-and-started instance confirmed zero security headers in the response.
**FIX:** Added `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` — deliberately NOT a Content-Security-Policy (see below).
**DELIBERATELY NOT FIXED — CSP:** Per the Gate 12 prompt's own explicit caution ("Do not add a CSP blindly that breaks Next.js. If adding CSP, test it"), and given this audit did not have time to enumerate every inline script/style Next.js's own hydration injects and verify a CSP against them in a real browser, no CSP was added. This is a real, open gap — documented, not concealed.
**REGRESSION TEST:** Not a unit test (headers are framework middleware behavior) — verified via a real `pnpm build` + `next start` + `curl -D -` showing all four headers genuinely present on a live response.
**STATUS: FIXED (the four safe headers), VERIFIED. CSP: ACKNOWLEDGED, not attempted.**
**EVIDENCE:** `evidence/system-audit/nextjs-boundary-audit.md`.

---

## F-10 — `next@15.5.25` bundles an internal, hard-pinned `postcss@8.4.31` with 2 HIGH + 2 MODERATE known vulnerabilities (source-map path traversal / arbitrary file disclosure, XSS in stringify output)

**SEVERITY: S3 (medium) — build-time CSS processing only; this app does not process attacker-supplied CSS at runtime, so classified NOT_REACHABLE for runtime exploitation, but still a real, currently-unpatched dependency.**
**SUBSYSTEM:** `apps/web`'s `next` dependency (transitive, not `apps/web`'s own `postcss` devDependency, which is already on a patched `8.5.28`).
**REPRODUCTION:** `pnpm audit --prod --registry https://registry.npmjs.org/` (the default mirror had no audit endpoint) — GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849 (both HIGH), GHSA-qx2v-qp2m-jg93, GHSA-fxqj-rqcc-2cmp (both MODERATE), all resolving to `next > postcss@8.4.31`.
**WHY NOT FIXED HERE:** `15.5.25` is already the latest patch release in the `15.5.x` line (confirmed via `npm view next versions`) — there is no same-line patch bump available. Fixing this requires a `15.6.x`-or-later minor version bump, which the Gate 12 prompt's own fix policy explicitly excludes from "safely scoped" (§24: "Do NOT blindly upgrade the entire dependency tree... Patch only safely scoped issues").
**STATUS: ACKNOWLEDGED, not fixed — recommended remediation: bump `next` to a version whose internal `postcss` pin is patched, as a separate, deliberately-tested change.**
**EVIDENCE:** `evidence/system-audit/dependency-audit.md`.

---

## F-11 — `ssr-fallback.ts`'s Cactus fetch follows redirects without re-validating the final destination against the host allowlist

**SEVERITY: S3 (medium)** — the *initial* request target is still constrained to 4 fixed, legitimate hostnames (`tally.xyz`, `www.tally.xyz`, `cactushq.xyz`, `www.cactushq.xyz`); this is not an attacker-controlled-arbitrary-host SSRF. It requires one of those trusted hosts to itself issue a redirect to an internal/metadata address (e.g. via an open redirect bug on that third-party site) for real impact.
**SUBSYSTEM:** `packages/cactus/src/ssr-fallback.ts`.
**REPRODUCTION:** `fetch(params.url, { redirect: "follow" })` (line ~55) — no code anywhere in this function or its caller inspects `response.url` (the post-redirect final URL) or re-runs it through `parseCactusProposalUrl`/`ALLOWED_HOSTS`.
**WHY NOT FIXED HERE:** Requires either switching to `redirect: "manual"` and re-validating each hop (a real behavior change to a load-bearing external-data path that would need its own testing against the real Tally/Cactus site, which this audit did not have time to do safely) or trusting the initial-host allowlist as sufficient (the current, if incomplete, posture). Flagged rather than silently patched under time pressure.
**STATUS: ACKNOWLEDGED, not fixed.**
**EVIDENCE:** `evidence/system-audit/ssrf-audit.md`.
