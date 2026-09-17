# Gate 11 — security scan

Performed before staging anything for commit, per Gate 11 §25. Re-run in full after a real hosted `DATABASE_URL` was supplied (this file's second pass — see "Second pass" below).

## Real secret values checked (present in this environment's gitignored `.env.local` files)

Repository-wide content search (`grep -r`, excluding `node_modules`/`.git`/`.next`) for the exact real values:

- OpenRouter API key (`sk-or-v1-...`) — found **only** in `.env.local` and `apps/web/.env.local`
- KeeperHub API key (`kh_...`) — found **only** in `.env.local`
- Gate 5 Sepolia deployer private key (`0x...`) — found **only** in `.env.local`
- Neon `DATABASE_URL` (real, hosted — see "Second pass" below) — found **only** in `.env.local`

Zero matches anywhere else in the working tree.

## Broad secret-shape patterns

Regex sweep (`sk-ant-...`, AWS `AKIA...`, GitHub `ghp_...`, Slack `xox[baprs]-...`, `BEGIN (RSA )?PRIVATE KEY`, a Postgres URL with real, non-placeholder embedded credentials) across every new/changed Gate 11 file (`packages/db/`, `evidence/production-persistence/`, `VERCEL_ENVIRONMENT.md`, both `.env.example` files) — zero matches.

## `DATABASE_URL` specifically — first pass (pre-hosted-DB)

At the time of this gate's first pass, every `DATABASE_URL` value appearing in a tracked-candidate file was the literal placeholder `postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require` (`.env.example`) — never a real host, credential, or database name. The `DATABASE_URL` in `.env.local` was itself still the unedited example value at that time.

## `DATABASE_URL` specifically — second pass (real hosted Neon credential now present)

The user has since placed a real Neon `DATABASE_URL` (with embedded username/password) in the root `.env.local`. Per the user's explicit instruction ("Do not print, echo, commit, or expose the connection string"), this scan was performed exclusively via filename-only / count-only checks — the value was read into a shell variable once (never echoed, never included in any command's visible arguments as a literal), then used as a `grep -F` pattern via variable expansion so it never appears in any tool call or terminal output:

- Full connection string, across the entire working tree excluding `node_modules`/`.git`/`.next`: matches found in **`.env.local` only**.
- The password substring alone (defense in depth, in case only a fragment leaked): matches found in **`.env.local` only**.
- Every raw test-output capture (`hosted-postgres-test-output.txt` and three earlier scratch captures under the OS temp directory, before any were copied into the tracked evidence directory): **zero matches**, for both the full string and the password substring — porsager/postgres's own error-wrapping (`wrapConnectionError` in `postgres-fulfillment-job-store.ts`) never logs the connection string, and no test in `postgres-fulfillment-job-store.contract.test.ts`/`.hosted.test.ts` prints it.
- `git diff --cached`, `git status`, and a full-history pickaxe search (`git log --all -p -S<password>`) — confirmed the secret has never entered the git index or any commit.
- `git check-ignore -v .env.local` — confirmed still ignored (`.gitignore:19:.env.local`).

No real Postgres credential appears anywhere in a tracked or about-to-be-tracked file.

## Runtime data files

- `apps/web/.data/marked.sqlite` (and any `-wal`/`-shm` sidecar) — confirmed covered by `.gitignore` (`apps/web/.data/`, plus the wildcard `*.sqlite*`/`*.sqlite3*` patterns added in the prior product-repair gate) and verified via `git check-ignore -v apps/web/.data/marked.sqlite`.
- No Postgres dump, backup, or exported data file was created or committed anywhere in this gate — `packages/db/migrations/0001_init.sql` contains only schema DDL, zero rows of data.

## `.gitignore` — re-verified, not merely trusted

Confirmed via `git check-ignore -v` (not by reading `.gitignore` text alone) that the following remain ignored: `.env.local`, `apps/web/.env.local`, `apps/web/.data/marked.sqlite`, `apps/web/tsconfig.tsbuildinfo`, `node_modules/` (including nested `apps/cli/node_modules/`). No new file type introduced by Gate 11 needed a new ignore rule beyond what the prior product-repair gate's hardened `.gitignore` already covers.

## What was intentionally left untracked

`.mcp.json` — a local Claude Code MCP tool config (no secrets, confirmed by direct read — just a URL reference to `https://app.keeperhub.com/mcp`), unrelated to the product, left untracked as in the prior gate.

## Conclusion

No secret leakage found. Safe to proceed with the staged, explicit-path commit sequence.
