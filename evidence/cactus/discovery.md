# Cactus surface discovery — Gate 1A

Date checked: 2026-09-15

This document records what was actually found about the current Cactus (formerly Tally) data surface, as opposed to what the PRD assumed. All claims below are backed by a live request made during this gate (see the command shown for each) or by an official/authoritative document fetched during this gate.

## 1. The Tally→Cactus rebrand and domain state

**Source: https://scopelift.co/blog/tally-is-now-cactus** — classification: `CURRENT_CACTUS` (official ScopeLift blog post announcing the rebrand).

- The product formerly known as Tally rebranded to **Cactus** on 2026-06-17.
- New domain: **cactushq.xyz**. Old domain: **tally.xyz** (temporary during transition — "Links with the old domain will continue to work for a while").
- Quote: *"In the near future, we'll begin forwarding all Tally URLs to cactushq.xyz."* — as of this check, that forwarding has **not** happened yet (see §2).
- API users were told to "get in contact to make sure they can migrate cleanly to the new domain" — implying the API itself was expected to eventually move, not that it changed shape at rebrand time.

## 2. Domain migration status (live-checked)

```bash
curl -sS -o /dev/null -w "%{http_code}" --max-time 15 -L https://cactushq.xyz/
# → timed out (no response)

curl -sS -X POST https://api.cactushq.xyz/query ...
# → could not resolve host (DNS failure)
```

**Finding: the `cactushq.xyz` domain migration described in the June 2026 announcement has not completed.** There is no live API or app at `cactushq.xyz` as of this check. All actually-live Cactus infrastructure discovered in this gate is still hosted under `tally.xyz` / `withtally.com` hostnames.

This is a real product-relevant discovery, not a failure to find the "real" Cactus: **the currently operated Cactus service is presently reached via the tally.xyz/withtally.com domains.** Per the Gate 1A instructions §3, the presence of "tally.xyz" in a URL is not by itself evidence of a deprecated/legacy system — it is evidence of an incomplete domain migration on an otherwise current, live service. See DEC-010.

## 3. Official GraphQL API

**Sources:** https://docs.tally.xyz/set-up-and-technical-documentation/welcome/how-to-use-the-tally-api , https://apidocs.tally.xyz/ , https://github.com/withtally/tally-api-quickstart — classification: `CURRENT_CACTUS` (official docs + official ScopeLift/withtally GitHub org repo).

| Field | Value |
|---|---|
| Type | GraphQL |
| Endpoint (per apidocs.tally.xyz / docs.tally.xyz) | `https://api.tally.xyz/query` |
| Alternate endpoint (per withtally/tally-api-quickstart README) | `https://api.withtally.com/query` |
| Auth header | `Api-Key: <key>` (docs.tally.xyz) — the quickstart repo shows lowercase `api-key`; HTTP headers are case-insensitive so this is not a real discrepancy |
| Key acquisition | Sign in to Cactus → User Settings page → "Cactus API" section → generate key. URL: `https://www.tally.xyz/user/settings` |
| Rate limit | Free tier: ~1 request/second. Paid tiers via Discord support. |
| Playground | `https://api.tally.xyz/playground` (per docs) / `https://api.withtally.com/playground` (per quickstart repo — live-confirmed below) |
| Relevant queries | `organization(input: {slug})`, `proposal(input: {onchainId, governorId})`, `governor`, `governors` |
| Proposal identity fields | `onchainId`, `chainId`, `governor { id, chainId, ... }`, `metadata { title }`, `status`, `organization` |
| Distinguishes offchain vs onchain ID | Yes — `id` (Tally-internal) is separate from `onchainId` (the blockchain proposal ID); `proposal(onchainId, governorId)` requires both since `onchainId` is not globally unique |

### Live reachability check (both hostnames, unauthenticated)

```bash
curl -X POST https://api.tally.xyz/query -d '{"query":"query { chains { id } }"}'
# → HTTP 401, {"errors":[{"message":"api key required","extensions":{"code":16}}],"data":null}

curl -X POST https://api.withtally.com/query -d '{"query":"query { chains { id } }"}'
# → HTTP 401, byte-identical error body

curl -X POST https://api.withtally.com/playground -d '{"query":"query { chains { id } }"}'
# → HTTP 200, returns the GraphiQL playground HTML, whose embedded fetcher
#   points at `location.host + "/query"` — i.e. api.withtally.com/query,
#   the same endpoint tested above.
```

**Finding: `api.tally.xyz` and `api.withtally.com` are the same live backend** (identical error bodies, and the playground's own fetcher targets `/query` on whichever host serves it). This is not two separate systems — one is very likely a DNS alias / CNAME of the other, or both point at the same origin. Both are genuinely live and current, not dead/deprecated endpoints.

### Authentication requirement

**Finding: the official GraphQL API requires `Api-Key` for every query tested, including a trivial `chains { id }` introspection-adjacent query.** There is no zero-auth read path on this API. `CACTUS_API_KEY` was not configured in this environment (checked `.env.local` and the process environment — neither set), so no authenticated query was possible during this gate.

**Status: `BLOCKED_CACTUS_CREDENTIAL`** for the official API specifically. The blocker is a missing credential, not a missing/broken surface — the surface is confirmed live. To unblock: sign in at `https://www.tally.xyz` (or `https://cactushq.xyz` once migrated), open User Settings, generate a key under "Cactus API", and set `CACTUS_API_KEY` in a local, uncommitted `.env`/`.env.local`. Free tier is sufficient for the two fixtures in this gate (well under 1 req/sec).

The GraphQL client in `packages/cactus/src/graphql-client.ts` is implemented faithfully against this documented schema shape (`organization` → `governorIds` → `proposal(onchainId, governorId)`) but has **not** been exercised end-to-end against a real authenticated response — see CLAIMS.md. It is unit-tested against mocked responses only.

## 4. Documented SSR fallback (what actually resolved both fixtures)

**Source:** the live Cactus/Tally web app itself, `https://www.tally.xyz/gov/{organizationSlug}/proposal/{onchainProposalId}` — classification: `CURRENT_CACTUS` (this is the current, actively-served production frontend; it is not a third-party scraper and not deprecated infrastructure, only unauthenticated and not a documented public API contract).

Both fixture URLs resolve with `HTTP 200` and embed a Next.js `__NEXT_DATA__` JSON script tag containing `props.pageProps.{proposal, organization, governors}` — the exact same identity data the official API would return (organization name/slug/id, proposal onchainId/title/status, governor id in `eip155:{chainId}:{address}` form, governor `type`/`kind`).

```bash
curl -sS -L "https://www.tally.xyz/gov/compound/proposal/220"
# → HTTP 200, redirects through
#   .../proposal/220?govId=eip155:1:0xc0Da02939E1441F497fd74F78cE7Decb17B66529
#   (the app's own redirect already reveals the correct Governor address)
```

This is exactly the two-tier resolution PRD.md §8.1 anticipated ("Official GraphQL/API first. Documented SSR fallback only if API cannot reproduce Gate 1A's fixtures"). Because it is unauthenticated, unversioned, and subject to change without notice (it is page-hydration data, not a public contract), `packages/cactus` labels every result obtained this way with `resolutionMethod: "ssr_fallback"`, distinct from `"official_api"` — see `packages/cactus/src/types.ts`. Both are labeled `sourceClassification: "CURRENT_CACTUS"` because both are served by the same live, currently-operated system (as opposed to some genuinely retired legacy endpoint).

**No historical/legacy resolution mechanism (e.g. an old, separately-versioned Tally API no longer maintained by the current team) was used or needed.** `LEGACY_TALLY` as a classification exists in the type system for completeness but was not exercised — both fixtures resolved through the current production system.

## 5. Rate limits / auth constraints observed

- Official API: ~1 req/s free tier (documented, not independently load-tested — two low-volume queries would not meaningfully test this).
- SSR fallback: no documented rate limit found; both fixture pages were fetched once each with no throttling observed. This is expected to be less stable long-term (no SLA), consistent with treating it as a fallback, not the primary path.

## 6. Summary table

| Surface | Live? | Auth required? | Used to resolve fixtures? | Classification |
|---|---|---|---|---|
| `api.tally.xyz/query` / `api.withtally.com/query` (official GraphQL) | Yes (confirmed) | Yes (`Api-Key`), no zero-auth path found | No — `BLOCKED_CACTUS_CREDENTIAL` (no key available) | `CURRENT_CACTUS` |
| `www.tally.xyz/gov/{slug}/proposal/{id}` (SSR page) | Yes (confirmed) | No | **Yes — both fixtures** | `CURRENT_CACTUS` |
| `cactushq.xyz` / `api.cactushq.xyz` | No (DNS/timeout) | N/A | No | N/A — migration incomplete |
| Any endpoint reasonably classified `LEGACY_TALLY` (i.e. genuinely retired) | Not found / not needed | — | No | — |
