# Gate 12 — result

## Verdict: CONDITIONAL PASS — every S0/S1/S2 finding is either FIXED+VERIFIED, or (one S1) explicitly ACKNOWLEDGED and presented as a user decision, per §53/§63/§64's own instruction not to silently redesign a documented, intentional product choice, and not to claim an unconditional PASS while a real, understood, severity-worthy item remains open for a human call.

13 real findings (`findings.md`), spanning S1 through S4. **Zero S0.** One S1 (F-03 — the demo login's token check is a self-comparison, not a real secret gate) is real, understood, and **intentionally not redesigned this gate** because the documented product intent (a judge never needs to know the real token) makes "require the real secret" a scope change, not a narrow security fix — and because, *at the time of this gate*, it could not reach a real blockchain effect (F-06: the live app had no execution write-path at all). **This is no longer unconditionally true — see the KeeperHub execution-wiring addendum below before relying on F-06.** Every other finding — including the two genuinely load-bearing S2s (F-01 concurrency, F-04 cost-abuse) and two live-reported real-world bugs found via follow-up hostile live-testing investigations after this gate's initial audit (CACTUS-LIVE-001, CACTUS-LIVE-002 — see below) — was fixed and verified with a real regression test.

## Addendum — CACTUS-LIVE-001 (live Cactus resolver finding, investigated after this gate's initial audit)

A user-reported live-testing finding (two real Cactus proposals, ENS and Optimism, appearing to fail resolution) was investigated with the same rigor as this gate's original audit: reproduced outside the UI first via the real production resolver functions, two competing root-cause hypotheses (Cactus page-shape drift, proposal-id precision loss) were tested directly and disproven, and the actual root cause — three independently-duplicated chain registries, one of which was missing Optimism's chain id — was found, fixed at the abstraction level (not a per-URL special case), and verified against a 9-DAO real live compatibility matrix. Full account: `evidence/system-audit/cactus-live-compatibility.md`; finding record: `findings.md` CACTUS-LIVE-001.

## Addendum — CACTUS-LIVE-002 (live "Resolve proposal" silent-failure finding, investigated after CACTUS-LIVE-001)

A second live user report on the same real deployment: clicking "Resolve proposal" reloaded the page with nothing shown, no error, reproducible in Incognito (ruling out a browser extension). Server-side resolution was confirmed correct first via direct `curl` requests against the live URL with `?url=...` explicitly present — ruling out a server/caching/RPC explanation before looking client-side. The user then captured the actual browser request, which showed the real root cause directly: `GET /app/new?` with an entirely empty query string — the `url` field was never submitted at all. Root cause: `ProposalIntakeForm.tsx`'s loading-state fix set `disabled` on the `url` input synchronously inside its own `onSubmit` handler, which races (and loses to) the browser's own form-submission step — a disabled control is excluded from the outgoing GET query string by every browser, per the HTML living standard. Fixed by using `readOnly` instead of `disabled` on that field, which structurally cannot be excluded from submission regardless of timing. Full account: `findings.md` CACTUS-LIVE-002.

Together these raise the total finding count above to 13 and are included in every regression/finding-count reference in this document from here on.

## Addendum — KeeperHub execution wiring (2026-09-18, a separate task performed after CACTUS-LIVE-002)

The disclosed submission limitation "KeeperHub execution is proven but not yet wired to the public web app" was closed: `apps/web/src/lib/execution/{prepare,approve-and-execute}.ts` wires the full ARM → eligibility → lifecycle → authorization → simulation → AWAITING_APPROVAL → APPROVE → `executeContractCall` → reconciliation → finality → postcondition verification → `FULFILLED_VERIFIED` pipeline, reusing every existing proven primitive unmodified. The real write is gated behind a new, independent, default-off `MARKED_ENABLE_KEEPERHUB_EXECUTION` flag, left unset on this deployment because F-03 (below) is not yet a safe boundary for a real write. **This materially changes F-06's conclusion** ("the live app has no execution write-path at all") — F-06 is marked superseded in `findings.md`, kept verbatim as the historical Gate 12 record; the current, accurate write-path boundary is documented in `docs/SECURITY.md` and `DECISIONS.md` DEC-030. Two new findings recorded: KEEPERHUB-WIRING-001 (the wiring itself, FIXED/VERIFIED) and KEEPERHUB-WIRING-002 (two narrow, honestly-surfaced gaps found while exercising the pipeline for the first time against a real job — a caller-authority model that correctly blocks every real-world governor except Gate 5's one source-diffed one, and one unhandled state-machine edge for a post-execution Governor-state disagreement; both ACKNOWLEDGED, not fixed, out of this task's explicit scope). Full account: `evidence/system-audit/keeperhub-execution-wiring.md`. This raises the total finding count above to 15.

## Evidence index

`evidence/system-audit/{repository-map,trust-boundaries,threat-model,findings,concurrency-audit,database-audit,auth-audit,ssrf-audit,cactus-governor-keeperhub-audit,agent-audit,xss-audit,receipt-postcondition-finality-audit,secrets-dependency-env-audit,nextjs-boundary-cache-vercel-audit,test-quality-audit,abuse-audit,historical-audit,claims-matrix,script-safety-git-security}.md`. `concurrency-audit.md` covers §6/§7/§8/§9/§10 (authorization, state-machine, concurrency, idempotency, unknown-broadcast); `cactus-governor-keeperhub-audit.md` covers §15-18; `secrets-dependency-env-audit.md` covers §22/§24/§39; `nextjs-boundary-cache-vercel-audit.md` covers §25/§26/§40; `receipt-postcondition-finality-audit.md` covers §27-30; `script-safety-git-security.md` covers §43-47/§50; `abuse-audit.md` covers §35-37.

## Pass-condition checklist (Gate 12 §63)

- [x] repository inventory complete — `repository-map.md`
- [x] trust boundaries documented — `trust-boundaries.md`
- [x] threat model complete — `threat-model.md`
- [x] authorization mutations tested — `concurrency-audit.md` §6 (reuses/re-confirms Gate 4/5's exhaustive mutation suite; no new gap found)
- [x] state-machine graph/invariants tested — `concurrency-audit.md` §7 (44/44 tests pass, including a new full-graph reachability check — no orphan states)
- [x] concurrency audit complete — `concurrency-audit.md` §8 (real gap found and fixed, F-01)
- [x] idempotency audit complete — `concurrency-audit.md` §9
- [x] unknown-broadcast recovery audited — `concurrency-audit.md` §10 (documented as designed-for-but-not-yet-live, honestly, not claimed proven)
- [x] Postgres hostile audit complete — `database-audit.md` §11
- [x] destructive-test safety proven — `database-audit.md`/`findings.md` F-02 (fixed, verified both directions)
- [x] migration safety audited — `database-audit.md` §12
- [x] auth attacked — `auth-audit.md`
- [x] SSRF attacked — `ssrf-audit.md` (one narrow gap found, F-11, documented not fixed)
- [x] Cactus adapter attacked — `cactus-governor-keeperhub-audit.md` §15
- [x] Governor RPC failures tested — `cactus-governor-keeperhub-audit.md` §16 (partially — live RPC-failure injection out of scope)
- [x] caller authority audited — `cactus-governor-keeperhub-audit.md` §17
- [x] KeeperHub client attacked without writes — `cactus-governor-keeperhub-audit.md` §18
- [x] agent boundary attacked — `agent-audit.md` §19
- [x] provider failures tested — `agent-audit.md` §20
- [x] XSS audit complete — `xss-audit.md` (zero found)
- [x] secret exposure audit complete — `secrets-dependency-env-audit.md` §22
- [x] `.claude/` and `.mcp.json` resolved — `findings.md` F-05 (fixed)
- [x] dependency audit complete — `secrets-dependency-env-audit.md` §24 (one real, deliberately-not-fixed finding, F-10)
- [x] Next.js server/client boundary audited — `nextjs-boundary-cache-vercel-audit.md` §25
- [x] caching/staleness audited — `nextjs-boundary-cache-vercel-audit.md` §26
- [x] explorer links audited — `receipt-postcondition-finality-audit.md` §27
- [x] receipt integrity attacked — `receipt-postcondition-finality-audit.md` §28 (verification of pre-existing depth)
- [x] postcondition attacked — `receipt-postcondition-finality-audit.md` §29 (verification of pre-existing depth)
- [x] finality/reorg behavior audited — `receipt-postcondition-finality-audit.md` §30 (documented, not live-tested — needs a real reorg)
- [x] historical assumptions reviewed — `historical-audit.md`
- [x] test-suite quality audited — `test-quality-audit.md`
- [x] destructive DB tests isolated from production — same as above, F-02
- [x] public cost-abuse path audited — `abuse-audit.md`/`findings.md` F-04 (fixed, verified)
- [x] logging audited — `abuse-audit.md` §37
- [x] env validation audited — `secrets-dependency-env-audit.md` §39 (two real gaps found and fixed, F-07/F-08)
- [x] Vercel serverless assumptions audited — `nextjs-boundary-cache-vercel-audit.md` §40
- [x] docs/code/evidence claim matrix complete — `claims-matrix.md`
- [x] stale/dead dangerous paths audited — `script-safety-git-security.md` §43/§44
- [x] complete blockchain write-path map produced — `repository-map.md` §44
- [x] package scripts audited for external mutation — `script-safety-git-security.md` §45
- [x] clean-clone assumptions audited — `script-safety-git-security.md` §46
- [x] Git/history security audited — `script-safety-git-security.md` §47
- [x] security headers reviewed — `findings.md` F-09 (4 safe headers added; CSP deliberately not attempted)
- [x] external link safety reviewed — `xss-audit.md` (explorer links are chain-id-driven, never user-string-driven)
- [x] dependency lock consistency checked — `script-safety-git-security.md` §50
- [x] every real finding classified — `findings.md`
- [x] every safe fix regression-tested — see per-finding entries in `findings.md`
- [x] full regression passes — see below
- [x] no new blockchain writes — confirmed (every change this gate is TypeScript/SQL/Markdown; the write-path-map re-confirms zero write-capable code exists in `apps/web`)
- [x] secret scan clean after evidence generation — see below
- [x] canonical Gate 2/5/6 values unchanged — `pnpm verify:gate6`, `receiptHash` identical
- [x] Gate 8 numbers unchanged — `pnpm verify:historical`, all statistics match; no defect was found requiring a recompute

## Full regression (re-run after every fix, final run reported here)

- `pnpm typecheck` — clean, all 10 packages.
- `pnpm lint` — clean (one warning found and fixed: an unused import in the new concurrency test).
- `pnpm test` — **678 passed, 7 explicitly skipped (2 Postgres live-test files' own guard when `DATABASE_URL`/`MARKED_ALLOW_DESTRUCTIVE_DB_TESTS` aren't both set, 5 Cactus live-network tests gated on `MARKED_RUN_LIVE_CACTUS_TESTS` — both the normal `pnpm test` path), 0 failed.** Up from Gate 11's 631 — the +14 from this gate's initial audit (state-machine reachability ×1, malformed-connection-string ×2, ARM/DISARM/APPROVE concurrency ×2, agent-provider-typo ×1, rate-limit unit tests ×6, rate-limit integration tests ×2), +30 from CACTUS-LIVE-001 (proposal-id losslessness ×18, hash-domains boundary ×10, ssr-fallback real-shaped fixtures ×2), and +3 from CACTUS-LIVE-002 (`ProposalIntakeForm.test.tsx`, the repository's first DOM-level component test).
- `pnpm build` — clean; re-confirmed `apps/web/.data/` is not created by a build (Gate 11 §21's fix still holds).
- `pnpm verify:gate6` — `receiptHash: 0x332ea2320ba4a0af131cfbfd78bfd55418b2eca6746df3d722c9eed2c77219c4`, unchanged.
- `pnpm verify:historical` — all 353-record statistics match the committed Gate 8 baseline exactly.
- Live hosted-Postgres suite (with the new `MARKED_ALLOW_DESTRUCTIVE_DB_TESTS=true` opt-in): re-confirmed both that it correctly SKIPS without the flag (even with `DATABASE_URL` reachable) and that it genuinely runs against the real Neon database with the flag set.
- A live `pnpm build` + `next start` + `curl` round trip confirmed the new security headers (F-09) are genuinely served, not merely configured.

## Final secret scan (after all fixes and evidence generation — Gate 12 §59)

Repeated the exact discipline established across every prior gate for this project: the real Neon `DATABASE_URL` from `.env.local` was read into a shell variable once, never echoed, and used only via `grep -F`/`git grep -F` variable expansion — never typed literally into any command or written to any output.

- Full connection string + the password substring alone, across the entire working tree (excluding `node_modules`/`.git`/`.next`): matches found in **`.env.local` only** (gitignored, confirmed via `git check-ignore -v`).
- Same two patterns, across every new/changed evidence file this gate produced (`evidence/system-audit/*.md`) and every new/changed source file: **zero matches.**
- `git diff --cached` / `git status` / a full-history pickaxe search (`git log --all -p -S<password-substring>`): confirmed the secret has never entered the git index or any commit.
- Broad secret-shape sweep (repeated from `secrets-dependency-env-audit.md`'s own scan, re-run after all this gate's edits) across the full tracked tree: zero real secrets found.

**No secret leakage found.**
