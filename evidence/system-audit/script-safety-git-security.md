# Gate 12 §43/§44/§45/§46/§47/§50 — dead code, write-path detail, package-script safety, clean-clone, git/history security, lockfile

## §45 — Package/script safety

Full inventory of every `pnpm`-aliased script across the monorepo (root, `apps/web`, `packages/db`, `scripts`):

- **`pnpm test`** (recursive `vitest run` across all packages): does not wipe a production DB (F-02's fix — requires explicit double opt-in even when `DATABASE_URL` is set), does not send a blockchain transaction (no test file imports anything from the write-path list, `repository-map.md`), does not require production credentials (every Postgres test cleanly skips without `DATABASE_URL`; the agent tests run with a fake key against a mocked `fetch`).
- **`pnpm build`** (`next build` only): does not migrate, write to the DB, call KeeperHub, or send a transaction — re-verified this gate (fresh build, `.data/` untouched).
- **`pnpm db:migrate`**: the only script that touches real DB schema; requires explicit `DATABASE_URL`; additive-only DDL (`§12`).
- **`pnpm verify:gate6`/`verify:historical`/`spot-check:historical`**: read-only re-verification against public/pinned onchain state and the committed historical dataset — confirmed by reading each script's top-level logic; none constructs a signer or calls a write function.
- **`pnpm prove:*`** (`cactus`, `keeperhub`, `closed-loop`, `governor`, `erc20-postcondition`, `fulfillment-commitment`, `agent-hardening`, `agent-live-model`): all map to `prove-*-seam.ts`/similarly-named scripts under `scripts/` — every one of these is a simulate/read/proof-capture script, confirmed by name and by the write-path grep (`repository-map.md`) finding zero write-capable calls outside `gate5-deploy-and-queue.ts`/`gate5-keeperhub-execute.ts`, **neither of which has a `pnpm` script alias at all** — they can only be invoked by running `tsx scripts/gate5-....ts` directly, a deliberate extra step outside the routine script surface.
- **`pnpm reproduce:historical`**: recomputes the historical baseline dataset from raw onchain logs — read-only (confirmed: no write-path import).

**Result: the entire routine `pnpm`-scripted surface (`test`, `build`, `verify:*`, `prove:*`, `reproduce:*`, `spot-check:*`) is read/simulate-only. The two genuinely blockchain-write-capable scripts in the whole repository are deliberately NOT exposed as package.json aliases**, requiring a developer to explicitly target the file by path — a real, structural speed bump against accidentally running them.

## §46 — Clean-clone assumptions

Reasoned from the code rather than performing an actual clean-room clone (out of this gate's time budget): without `.env.local`, `job-store.ts` defaults `MARKED_STORAGE_DRIVER` to `"sqlite"` and lazily creates `.data/` — the app boots and the read-only pages work; ARM/APPROVE/DISARM fail closed with `UnauthenticatedError` (no `MARKED_DEMO_SESSION_TOKEN` configured, confirmed the exact refusal message: "No demo session token is configured on the server — refusing to authenticate anyone."). Without `node_modules`, `pnpm install` is required as documented (`README.md`); without a `DATABASE_URL` and `MARKED_STORAGE_DRIVER=postgres` unset, no Postgres dependency is exercised at all. Without `CACTUS_API_KEY`/`OPENROUTER_API_KEY`/`ANTHROPIC_API_KEY`, Cactus resolution falls through to the public SSR path (by design, not a failure) and the agent panel reports unavailable (by design). No hidden dependency on any machine-specific path or credential was found in any of this gate's own new code or in the paths read this gate.

## §47 — Git/history security

`.gitignore`/`.gitattributes` reviewed; F-05's fix (`.claude/scheduled_tasks.lock`, `.mcp.json`) applied. No tracked binaries/large files/coverage/screenshots/browser-profile artifacts found (`git ls-files` composition matches the expected source+evidence+docs shape). Full-history pickaxe secret scan: see `secrets-dependency-env-audit.md` §22 — zero real secrets anywhere in the 18-commit history. `.vercel`/`.env*` correctly ignored (re-confirmed via `git check-ignore -v`). **No secret was found in git history requiring a stop-the-push/history-rewrite response.**

## §50 — Supply-chain/lockfile

`pnpm-lock.yaml` is committed and current — `pnpm install --frozen-lockfile`-equivalent consistency implied by every `pnpm` command in this gate's own regression run completing without a lockfile-mismatch error (pnpm refuses a mismatched lockfile by default in CI-like invocations). No dependency version was changed this gate (the PostCSS/Next.js finding, F-10, was deliberately NOT acted on — see `secrets-dependency-env-audit.md` §24), so the lockfile required no update.

## §43/§44 — Dead code / stale config (spot findings, not exhaustive)

- `SEPOLIA_EXPLORER` constant (`evidence.ts:136`) — declared, never imported elsewhere. Not fixed (cosmetic).
- No leftover "Option A" workflow code, no `broadcaster`/`rawTx` fallback pattern, no ambiguous `{simulate: maybe}` execute path — all grep-confirmed absent (`repository-map.md`, `cactus-governor-keeperhub-audit.md` §18).
- No stale "Supabase"/old-product-name references found beyond what Gate 11's own audit already corrected (spot-checked, not re-derived in full — see `claims-matrix.md` for the docs/code consistency pass that would surface any remaining drift).
