# Gate 11 — security scan

Performed before staging anything for commit, per Gate 11 §25.

## Real secret values checked (present in this environment's gitignored `.env.local` files)

Repository-wide content search (`grep -r`, excluding `node_modules`/`.git`/`.next`) for the exact real values:

- OpenRouter API key (`sk-or-v1-...`) — found **only** in `.env.local` and `apps/web/.env.local`
- KeeperHub API key (`kh_...`) — found **only** in `.env.local`
- Gate 5 Sepolia deployer private key (`0x...`) — found **only** in `.env.local`

Zero matches anywhere else in the working tree.

## Broad secret-shape patterns

Regex sweep (`sk-ant-...`, AWS `AKIA...`, GitHub `ghp_...`, Slack `xox[baprs]-...`, `BEGIN (RSA )?PRIVATE KEY`, a Postgres URL with real, non-placeholder embedded credentials) across every new/changed Gate 11 file (`packages/db/`, `evidence/production-persistence/`, `VERCEL_ENVIRONMENT.md`, both `.env.example` files) — zero matches.

## `DATABASE_URL` specifically

Every `DATABASE_URL` value appearing in a tracked-candidate file is the literal placeholder `postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require` (`.env.example`) — never a real host, credential, or database name. The `DATABASE_URL` actually present in this environment's gitignored `.env.local` is itself still the unedited example value (`postgresql://user:password@localhost:5432/marked_dev`), confirmed by reading the file directly — there is no real Postgres credential anywhere in this environment to accidentally leak.

## Runtime data files

- `apps/web/.data/marked.sqlite` (and any `-wal`/`-shm` sidecar) — confirmed covered by `.gitignore` (`apps/web/.data/`, plus the wildcard `*.sqlite*`/`*.sqlite3*` patterns added in the prior product-repair gate) and verified via `git check-ignore -v apps/web/.data/marked.sqlite`.
- No Postgres dump, backup, or exported data file was created or committed anywhere in this gate — `packages/db/migrations/0001_init.sql` contains only schema DDL, zero rows of data.

## `.gitignore` — re-verified, not merely trusted

Confirmed via `git check-ignore -v` (not by reading `.gitignore` text alone) that the following remain ignored: `.env.local`, `apps/web/.env.local`, `apps/web/.data/marked.sqlite`, `apps/web/tsconfig.tsbuildinfo`, `node_modules/` (including nested `apps/cli/node_modules/`). No new file type introduced by Gate 11 needed a new ignore rule beyond what the prior product-repair gate's hardened `.gitignore` already covers.

## What was intentionally left untracked

`.mcp.json` — a local Claude Code MCP tool config (no secrets, confirmed by direct read — just a URL reference to `https://app.keeperhub.com/mcp`), unrelated to the product, left untracked as in the prior gate.

## Conclusion

No secret leakage found. Safe to proceed with the staged, explicit-path commit sequence.
