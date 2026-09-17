# Gate 12 §22/§24/§39 — secret exposure, dependency, environment-validation audit

## §22 — Secret exposure

Full repo-wide scan (working tree, tracked files, staged diff, `git log --all` pickaxe search across all 18 commits) for `sk-or-v1-`, `sk-ant-`, `AKIA`, `ghp_`, `xox[baprs]-`, `BEGIN (RSA )?PRIVATE KEY`, `postgresql://` with a non-placeholder host, and a `(PRIVATE_KEY|secret)\s*[:=]\s*['"]?0x[0-9a-fA-F]{20,}` pattern: **zero real secret values found anywhere in the tracked repository, past or present.** Every match is either a documented placeholder (`.env.example`, `VERCEL_ENVIRONMENT.md`) or a real, already-public transaction/content hash explicitly labeled as such in `CLAIMS.md`/`DECISIONS.md`/`GATES.md` (never private-key material). `kh_test_key` in `packages/keeperhub/src/client.test.ts` is a test fixture, not a real key.

**`NEXT_PUBLIC_APP_ENV`** is the only `NEXT_PUBLIC_*` variable in the entire repository — a bare environment-label enum, genuinely safe to expose (this gate additionally now reads it server-side for the `Secure` cookie decision — still never exposed to the client beyond its own already-public purpose).

**Server-only secret into a Client Component**: traced the two most likely candidates in full (the agent provider's API key, KeeperHub's API key) — neither is ever passed as a prop into a `"use client"` component; only booleans, plain strings, and Next's own opaque Server Action references cross that boundary. No leak found.

**`.claude/`/`.mcp.json`**: see finding F-05 (fixed) and `git-security.md`.

## §24 — Dependency audit

`pnpm audit --prod` (re-run against `registry.npmjs.org` directly, since the default mirror had no audit endpoint): 4 vulnerabilities, all inside `next@15.5.25`'s internally-bundled, hard-pinned `postcss@8.4.31` — 2 HIGH (source-map path traversal / arbitrary `.map` file disclosure), 2 MODERATE (incomplete fix of the same, and a CSS-stringify XSS). `apps/web`'s own `postcss` devDependency is already on a patched `8.5.28`; the vulnerable copy is Next's own internal one, not independently upgradable without bumping Next itself. `15.5.25` is confirmed the latest patch in the `15.5.x` line (checked `npm view next versions`) — no same-line fix exists. **Classified S3, not fixed** (would require a minor Next.js version bump, outside this gate's "patch only safely scoped issues" policy) — see finding F-10.

No other deprecated/unmaintained/typosquat-looking dependency was found across any `package.json` in the monorepo. `next@15.5.25` is well past the version that fixed the CVE-2025-29927 middleware-authorization-bypass advisory (`15.2.3`), and this app has no `middleware.ts` at all, so that specific advisory class is moot here regardless.

## §39 — Environment validation audit

Every `process.env[...]` read across the repo, and what happens for a malformed (not merely absent) value:

| Variable | Malformed-value behavior |
|---|---|
| `MARKED_STORAGE_DRIVER` | Fails closed with a named `PersistenceConfigurationError` for anything other than exactly `"sqlite"`/`"postgres"`/unset (e.g. `"postgress"`) — correct, pre-existing (Gate 11). |
| `DATABASE_URL` | **Fixed this gate (F-07)**: a genuinely malformed value now throws `PersistenceConfigurationError` instead of a raw driver `TypeError`. |
| `MARKED_AGENT_PROVIDER` | **Fixed this gate (F-08)**: an unrecognized-but-set value now fails closed (`null`/unavailable) instead of silently falling through to auto-select. |
| `MARKED_ALLOW_DESTRUCTIVE_DB_TESTS` | New this gate — strict `=== "true"` compare; any other value (including `"True"`/`"1"`) is treated as not-opted-in. Fails safe by design. |
| `MARKED_DEMO_SESSION_TOKEN` | Read as `?? ""`; an unset token can never accidentally authenticate anyone (`requireAuthenticatedActor` throws `UnauthenticatedError` whenever `expectedToken` is empty — test-proven). |
| `CACTUS_API_KEY` | Empty/falsy fails closed (`CactusResolutionError`); a non-empty garbage value is simply rejected upstream by Cactus's own API — no local format validation, acceptable since the failure is still safe (typed error, no data leak). |
| `ETHEREUM_RPC_URL`/`SEPOLIA_RPC_URL` | No local validation; a malformed URL fails late inside viem's own transport as a generic error, not a clean named Marked error (minor gap, S4, not fixed — see `cactus-governor-keeperhub-audit.md` §16). If unset, viem falls back to its own public default RPC per chain — documented behavior, not a bug. |
| `GATE5_DEPLOYER_PRIVATE_KEY` | Script-only (never in `apps/web`); only a type assertion + presence check, no hex/length validation locally — malformed values fail later inside viem's own account derivation. Out of live-product scope. |
| `ENABLE_MAINNET_WRITE`/`ENABLE_PUBLIC_RECEIPTS`/`NEXT_PUBLIC_APP_ENV` | Have a genuinely strict Zod validator (`packages/config/src/env.ts`) that DOES reject malformed values — but `parseEnv`/`EnvSchema` is confirmed (by grep, re-confirmed this gate) never invoked from any runtime path in `apps/web` or `scripts/*.ts`. These three variables have zero effect on deployed behavior regardless of their value — already honestly disclosed in Gate 11's `CLAIMS.md` ("not claiming `EnvSchema`/`parseEnv` is wired into the app's startup path"), re-confirmed still accurate. |

**Summary**: the variables that actually gate real live-app behavior (`MARKED_STORAGE_DRIVER`, `MARKED_DEMO_SESSION_TOKEN`, `CACTUS_API_KEY`, and now `DATABASE_URL`/`MARKED_AGENT_PROVIDER` after this gate's two fixes) all fail closed on malformed input. The two remaining soft spots (RPC URLs, `GATE5_DEPLOYER_PRIVATE_KEY`) fail late with generic rather than typed errors but do not fail OPEN (no silent success-with-wrong-behavior case was found anywhere).
