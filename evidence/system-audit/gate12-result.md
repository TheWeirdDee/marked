# Gate 12 — result

## Verdict: CONDITIONAL PASS — every S0/S1/S2 finding is either FIXED+VERIFIED, or (one S1) explicitly ACKNOWLEDGED and presented as a user decision, per §53/§63/§64's own instruction not to silently redesign a documented, intentional product choice, and not to claim an unconditional PASS while a real, understood, severity-worthy item remains open for a human call.

11 real findings (`findings.md`), spanning S1 through S4. **Zero S0.** One S1 (F-03 — the demo login's token check is a self-comparison, not a real secret gate) is real, understood, and **intentionally not redesigned this gate** because the documented product intent (a judge never needs to know the real token) makes "require the real secret" a scope change, not a narrow security fix — and because it cannot reach a real blockchain effect today (F-06: the live app has no execution write-path at all). Every other finding — including the two genuinely load-bearing S2s (F-01 concurrency, F-04 cost-abuse) — was fixed and verified with a real regression test.

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
- `pnpm test` — **645 passed, 2 explicitly skipped (both Postgres live-test files' own guard when `DATABASE_URL`/`MARKED_ALLOW_DESTRUCTIVE_DB_TESTS` aren't both set — the normal `pnpm test` path), 0 failed.** Up from Gate 11's 631 — the +14 are this gate's new regression tests (state-machine reachability ×1, malformed-connection-string ×2, ARM/DISARM/APPROVE concurrency ×2, agent-provider-typo ×1, rate-limit unit tests ×6, rate-limit integration tests ×2).
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
