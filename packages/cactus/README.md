# @marked/cactus

## Responsibility

Owns `CactusProposalAdapter` (`resolveCactusProposal`). It resolves a Cactus (formerly Tally) proposal URL to the human governance object: organization, title, chain, Governor address, and onchain proposal ID.

**It identifies. It does not authorize.** `ResolvedCactusProposal` deliberately has no field for authorized calldata, execution actions, or a canonical authorization hash — see the comment block in `src/types.ts` and DEC-001 in `DECISIONS.md`. The Governor (`packages/governor`, Gate 2+) is the sole execution authorization source.

## Status

**Gate 1A: implemented and live-verified** for the two PRD fixtures (Compound #220, Uniswap #20) via `pnpm prove:cactus`. See `evidence/cactus/` and `CLAIMS.md` for exactly what is proven versus still `TARGET`/`BLOCKED`.

## How resolution works

1. **Parse and validate the URL** (`src/url.ts`) — host allowlist (`tally.xyz`, `www.tally.xyz`, `cactushq.xyz`, `www.cactushq.xyz`) and strict `/gov/{slug}/proposal/{id}` path shape. This is the SSRF boundary; anything else fails closed with `CACTUS_URL_INVALID` or `CACTUS_HOST_NOT_ALLOWED`.
2. **Official GraphQL API first** (`src/graphql-client.ts`, `https://api.tally.xyz/query`) — only attempted if `CACTUS_API_KEY` is set in the environment; otherwise fails fast with `CACTUS_AUTH_REQUIRED` rather than sending a doomed request. As of Gate 1A, no key was available in this environment, so this path is implemented against the documented schema but **not live-verified end-to-end** — see `evidence/cactus/discovery.md`.
3. **Documented SSR fallback** (`src/ssr-fallback.ts`) — only on an auth-class failure from step 2. Fetches the live Cactus proposal page and reads the same `__NEXT_DATA__` hydration payload the production app itself renders from. This is real, current Cactus infrastructure, not a hardcoded value — but it is unauthenticated and unversioned, so every result is labeled `resolutionMethod: "ssr_fallback"`, never conflated with an official-API success.

There is no code path anywhere in this package that substitutes a hardcoded Governor/chain/proposal-id value when resolution fails — see the "never substitutes" tests in `src/index.test.ts`, `src/graphql-client.test.ts`, and `src/ssr-fallback.test.ts`.

## Failure modes (all typed, all fail closed)

`CACTUS_URL_INVALID`, `CACTUS_HOST_NOT_ALLOWED`, `CACTUS_PROPOSAL_NOT_FOUND`, `CACTUS_AUTH_REQUIRED`, `CACTUS_RATE_LIMITED`, `CACTUS_RESPONSE_INVALID`, `CACTUS_GOVERNOR_MISSING`, `CACTUS_CHAIN_MISSING`, `CACTUS_ONCHAIN_ID_MISSING`, `CACTUS_SOURCE_UNSUPPORTED` — see `src/errors.ts`.

## Reproducing the live evidence

```bash
pnpm prove:cactus
```

Runs `scripts/prove-cactus-seam.ts`: resolves both fixtures, performs a minimal read-only onchain sanity check (contract code + `proposals(id)` readable, via viem), and regenerates every file under `evidence/cactus/{compound-220,uniswap-20}/`. This is a live-network script, deliberately kept out of `pnpm test` (which stays mocked and deterministic).
