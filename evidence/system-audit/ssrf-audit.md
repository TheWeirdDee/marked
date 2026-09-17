# Gate 12 §14 — SSRF audit of `/app/new`'s Cactus URL input

Single entry point: `/app/new?url=` → `resolveAndOpenAction` → `resolveGovernanceIntake` → `resolveCactusProposal` → `packages/cactus/src/url.ts`'s `parseCactusProposalUrl`.

## The allowlist boundary (verified by direct read)

```
const ALLOWED_HOSTS = new Set(["www.tally.xyz","tally.xyz","www.cactushq.xyz","cactushq.xyz"]);
const PROPOSAL_PATH_PATTERN = /^\/gov\/([a-z0-9-]+)\/proposal\/([a-zA-Z0-9_-]+)\/?$/;
```
`https:`-only protocol check, exact-match hostname check (not a suffix/substring match — `evilcactus.com`/`tally.xyz.evil.com`/subdomain-confusion attempts all fail this check, since `parsed.hostname` must equal one of the 4 literal strings exactly), strict path regex. The URL actually fetched is rebuilt from only `hostname`+`pathname` — userinfo, query string, and fragment are discarded, so an embedded-credential URL (`https://user:pass@www.tally.xyz/...`) passes the host check but the credentials never reach the outbound fetch.

## Hostile inputs tested (by direct reasoning against the code, not a live network attack)

| Input | Outcome |
|---|---|
| `http://localhost/...`, `http://127.0.0.1/...`, `http://0.0.0.0/...`, `http://[::1]/...` | Rejected — `protocol !== "https:"` |
| `http://169.254.169.254/...` (cloud metadata) | Rejected on protocol; retried as `https://169.254.169.254/gov/x/proposal/y` still rejected (`ALLOWED_HOSTS` exact-match fails) |
| `file://...`, `data:...`, `javascript:...`, `ftp://...` | Rejected — `new URL()` either throws or `protocol !== "https:"` |
| Mixed-case hostname (`WWW.TALLY.XYZ`) | `URL.hostname` is normalized to lowercase by the WHATWG URL parser before the allowlist check runs — passes correctly, not a bypass |
| Punycode/lookalike hostname | Would resolve to a hostname string that does not exactly match any of the 4 allowlisted strings — rejected |
| `cactus.example.com`, `evilcactus.com`, `tally.xyz.evil.com` | Rejected — exact-match host check, no suffix matching |
| Encoded slashes/host characters in the path | Path regex is strict (`[a-z0-9-]`/`[a-zA-Z0-9_-]` only) — anything encoded/unexpected fails the regex |
| Huge URL | Not explicitly length-capped, but bounded in practice by the strict path regex + Next.js's own request-size limits; not treated as a distinct finding |
| A URL that redirects elsewhere | **Followed (`redirect: "follow"`) by the SSR-fallback path, and the final destination is NOT re-validated against the allowlist — this is a real, if narrow, gap. See finding F-11.** |

## Cactus-resolution-failure never falls back to raw coordinates

Traced the full path: `resolveGovernanceIntake` only ever builds a `GovernanceCoordinate` from a *successful* `resolveCactusProposal` result; every failure mode throws a typed `CactusResolutionError` that `resolveAndOpenAction` catches and redirects to an error state — there is no branch anywhere that constructs a job/commitment from the raw, unvalidated `proposalUrl` string. `assertNoAuthorityLeak` (a test helper in `governance-coordinate.ts`) further structurally enforces that a `GovernanceCoordinate` can never carry calldata/authorization fields — Cactus only ever supplies "where to look," never "what was authorized." The authorization itself is always independently re-derived via a direct RPC call (`refreshAuthorizationHash`), never via Cactus.

**Result: the allowlist is real and correctly implemented for the initial request. The one gap (F-11, redirect-destination re-validation) is documented, not silently fixed, given it requires a behavior change to a load-bearing external-data path this audit did not have time to test safely against the real Tally/Cactus site.**
