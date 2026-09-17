# Gate 12 CACTUS-LIVE-001 — live Cactus compatibility matrix and root-cause investigation

## Reproduction, outside the UI first

Called the exact production resolver directly (`resolveCactusProposal` from `packages/cactus`, then the full `resolveGovernanceIntake` from `apps/web/src/lib/governance.ts`) against both reported URLs and the two Gate 1A fixtures, via `tsx` — no browser involved.

| URL | HTTP status | Redirected | Content-Type | Response size | `__NEXT_DATA__` present | Resolution |
|---|---|---|---|---|---|---|
| Compound #220 | 200 | yes (adds `?govId=`) | text/html | 237,896 chars | yes | Cactus: success. Intake: `familySupported=true`, `ALREADY_EXECUTED` |
| Uniswap #20 | 200 | no | text/html | 273,768 chars | yes | Cactus: success. Intake: `familySupported=true`, `ALREADY_EXECUTED` |
| ENS (real proposal) | 200 | no | text/html | 254,922 chars | yes | Cactus: success. Intake: `familySupported=false` (`openzeppelingovernor`) |
| Optimism (real proposal) | 200 | no | text/html | 268,714 chars | yes | Cactus: success **before fix**; intake threw `UNSUPPORTED_CHAIN` (see root cause below). **After fix**: succeeds, `familySupported=false` (`openzeppelingovernor`) |

`__NEXT_DATA__` extraction, JSON parse, and every required field (`proposal.onchainId`, `proposal.status`, `proposal.governor`, `proposal.metadata.title`, `organization`, `governors[]`) were present and well-formed for **all four** URLs — no dump of full page HTML was made or committed; only structural presence/absence and specific field values were captured, as instructed.

## Root cause: NOT a Cactus/page-shape/precision problem — an out-of-sync chain registry

The investigation's leading hypotheses going in were (a) Cactus's frontend had changed shape (ScopeLift's August 2026 report was taken seriously) and (b) large uint256-scale proposal IDs were losing precision somewhere in the pipeline. **Both were tested directly and ruled out:**

**(a) Page shape**: identical `pageProps` top-level keys (`proposal, organization, governors, descriptionExceptions, isWhiteLabel, dehydratedState, _sentryTraceData, _sentryBaggage`) and identical `proposal` object keys (`id, onchainId, metadata, status, voteStats, start, end, events, governor`) across all four URLs, confirmed by direct inspection of the live, current responses. The SSR-embedded `__NEXT_DATA__` structure `packages/cactus/src/ssr-fallback.ts` already parses has not changed in a way that affects this resolver.

**(b) Proposal-ID precision**: `proposal.onchainId` arrived as a JSON **string** (`typeof "string"`), not a JSON number, for all four proposals — including the 77- and 78-digit ENS and Optimism IDs — and every hop downstream (`packages/cactus`'s `ParsedCactusProposalUrl`/`GovernanceCoordinate`, `packages/governor`'s `BigInt(...)` conversion, `packages/core`'s ABI-encoded hashing) is typed `string` end-to-end with zero `Number()`/`parseInt()`/`parseFloat()` coercion anywhere in the path (confirmed by a repo-wide grep). See `packages/cactus/src/proposal-id-losslessness.test.ts` and `packages/core/src/hash-domains.test.ts`'s new boundary-value describe block for permanent, explicit proof across `0, 1, 220, 2^53-1, 2^53, 2^256-1`, and the exact real ENS/Optimism IDs — all 18 + 10 tests pass.

**The actual root cause**: `apps/web/src/lib/governance.ts` maintained its **own, independent copy** of a `CHAINS_BY_ID: Record<number, Chain>` map — a duplicate of the same map already living in `packages/governor/src/resolve.ts` and a third copy in `packages/governor/src/verify-existence.ts`. All three were hand-maintained separately. The web app's copy listed `{1, 11155111, 84532}` — mainnet, Sepolia, Base Sepolia — but not `10` (Optimism). ENS is on mainnet (chain 1, already listed), so it never hit this gap. Optimism's real proposal is on chain 10, which the web app's copy of the map didn't have — `resolveGovernorAuthorization` threw `GovernorResolutionError("UNSUPPORTED_CHAIN", ...)` before it ever got the chance to run the live Bravo-family probe that would have produced the more accurate `UNSUPPORTED_GOVERNOR_FAMILY` diagnosis (which is what ENS correctly receives).

**This is exactly the "variation in an underlying abstraction" the investigation was asked to find, not a per-URL symptom.** The fix (below) is architectural, not a slug-specific special case.

## Fix

Centralized the chain registry into one new file, `packages/governor/src/supported-chains.ts` (`SUPPORTED_CHAINS`/`chainById`, exported from the package barrel), and updated all three previously-independent copies (`packages/governor/src/resolve.ts`, `packages/governor/src/verify-existence.ts`, `apps/web/src/lib/governance.ts`) to import and use it instead of maintaining their own. The registry now includes Optimism (chain 10, via viem's built-in `optimism` chain export, with an optional `OPTIMISM_RPC_URL` env var falling back to viem's public default RPC — the same pattern already used for mainnet). **No new blockchain write capability was added** — this only expands which chains Marked can open a real, read-only RPC client against for a Governor-family probe.

Verified after the fix, via the same direct `tsx` reproduction: `resolveGovernanceIntake` for the Optimism URL no longer throws at all. It now returns `familySupported: false` with the exact reason `"Governor 0xcDF27F107725988f2261Ce2256bDfCdE8B382B10 did not respond to the Bravo family probe (initialProposalId()). Gate 2 implements Governor Bravo only — see DECISIONS.md."` — the same class of accurate, specific diagnosis ENS already received, converging Optimism onto the correct `UNSUPPORTED_AUTHORIZATION` fulfillability outcome instead of a generic, less-useful `UNSUPPORTED_CHAIN`-derived "Resolution failed" message.

Also fixed as a direct consequence of this investigation: `/app/new/page.tsx` was missing the explicit `export const dynamic = "force-dynamic"` marker present on every sibling DB/RPC-backed page — added for consistency and explicitness (Next.js's own `searchParams`-triggers-dynamic behavior already made this route dynamic in practice, confirmed by its `ƒ` marker in every build output this project has produced, so this is a defense-in-depth correction, not a fix for a traced live bug). This also corrects an inaccurate claim the Gate 12 audit had made (`repository-map.md` previously stated this page already had the explicit marker).

## Paused-DAO handling (§5)

Cactus's `organization.isPaused`/`pauseReason` fields (Optimism: `isPaused: true, pauseReason: "Custom governance not currently supported"`) were previously discarded entirely by `resolveViaSsrFallback` — never captured, never surfaced. Now captured on `ResolvedCactusProposal.organization` (context-only field, exactly like every other field on that type — never treated as execution authority, consistent with DEC-001) and rendered as an explicit, clearly-labeled banner on `/app/new` when present: *"Cactus reports this DAO's page as paused ('Custom governance not currently supported'). That is a Cactus-side context signal, not onchain execution authority — Marked independently reads the Governor onchain regardless..."* Marked's own onchain resolution proceeds exactly the same whether or not a DAO's Cactus page is marked paused — verified: Optimism's real Governor was still independently probed and correctly diagnosed as `UNSUPPORTED_GOVERNOR_FAMILY`, unaffected by the pause flag.

## Live compatibility matrix (9 real, distinct DAOs, read-only, zero writes)

All resolved via `resolveGovernanceIntake` after the fix above:

| DAO | Chain | Cactus's own governor "kind" | Marked's live probe result | Fulfillability outcome | Notes |
|---|---|---|---|---|---|
| Compound | 1 (mainnet) | governorbravo | **SUPPORTED** (Bravo) | `ALREADY_EXECUTED` | Gate 1A/2/6 canonical fixture |
| Uniswap | 1 | governorbravo | **SUPPORTED** (Bravo) | `ALREADY_EXECUTED` | Gate 1A canonical fixture |
| Nouns DAO | 1 | **governorbravo** | **UNSUPPORTED** — live probe fails | `UNSUPPORTED_AUTHORIZATION` | Cactus's own label says Bravo; Marked's real, live `initialProposalId()` call against the actual deployed contract does not respond as Bravo. A real, concrete confirmation that Cactus's `kind` tag is not a reliable compatibility signal — exactly why BUILD_CONTRACT law 42 requires a live probe, never a label. |
| Instadapp | 1 | **governorbravo** | **UNSUPPORTED** — live probe fails | `UNSUPPORTED_AUTHORIZATION` | Same phenomenon as Nouns DAO, independently confirmed on a second, unrelated DAO |
| ENS | 1 | openzeppelingovernor | **UNSUPPORTED** | `UNSUPPORTED_AUTHORIZATION` | The original reported case — correctly diagnosed even before this gate's fix |
| Optimism | 10 | openzeppelingovernor | **UNSUPPORTED** | `UNSUPPORTED_AUTHORIZATION` | The original reported case — required the chain-registry fix above to reach this diagnosis at all |
| Gitcoin | 1 | governoralpha | **UNSUPPORTED** | `UNSUPPORTED_AUTHORIZATION` | A third distinct unsupported family observed |
| Aave | 1 | aave (custom) | **UNSUPPORTED** | `UNSUPPORTED_AUTHORIZATION` | A fourth distinct unsupported family observed |
| PoolTogether | 1 | governoralpha | **UNSUPPORTED** | `UNSUPPORTED_AUTHORIZATION` | Second GovernorAlpha-family data point |

**Cactus resolution succeeded for 9/9 (100%).** **Marked Governor-family support: 2/9 (Compound, Uniswap) — both already-executed, real Governor Bravo deployments.** Every one of the other 7 was correctly, honestly diagnosed as `UNSUPPORTED_AUTHORIZATION` with a specific, accurate reason — **zero silent failures, zero generic "resolution failed" for a reason that was actually about Governor support, not Cactus.**

This is compatibility testing, not an excuse to claim broader support than proven: **Marked's fulfillment engine supports Governor Bravo only, as already documented.** What this investigation adds is proof that the *resolution and diagnosis* layer — telling an operator clearly what Cactus found and why Marked can or cannot fulfill it — now works correctly and informatively across a materially diverse, real sample, not just the two original hand-picked fixtures.

## What remains honestly unresolved

Direct reproduction (both the raw resolver functions and full HTTP GET requests through the exact page render, matching what the "Resolve proposal" button's plain GET-form submission does) produced **correct, informative results** for both originally-reported URLs — a clear "Unsupported authorization" outcome for ENS even before any fix, and the same outcome for Optimism after the chain-registry fix. **This investigation could not reproduce a literal blank/silent page** through the server-rendering pipeline itself, which is the authoritative, production code path. The real, confirmed, fixed bug (the Optimism chain-registry gap) explains a genuine wrong/unhelpful RESULT (a less-accurate "chain not supported" message instead of the correct "Governor not supported" one) — not literally "nothing renders." Whether the reporter's exact "silent reload, nothing appears" symptom was caused by something client-side/session-specific (browser extension DOM mutation, as independently flagged and not dismissed — see below) or has since resolved as a side effect of this gate's fixes could not be independently confirmed without a real, controlled browser reproduction this investigation did not have the tooling to perform.

## Browser extension hydration warning (§8)

Not investigated further as a Marked application bug — the `data-cap-chrome-extension-installed`/`data-new-gr-c-s-check-loaded`/`data-gr-ext-installed` attributes are a well-documented pattern of Grammarly-class browser extensions injecting `<html>`/`<body>` attributes before React hydration. No `suppressHydrationWarning` was added anywhere in this codebase as a result of this investigation — per the explicit instruction not to add it merely to silence extension-modified DOM without independent justification, and because this investigation's server-side reproduction did not depend on or interact with client-side hydration at all (the content that matters — the resolved proposal, the outcome badge — is present in the server-rendered HTML before any hydration occurs). Classified `EXTENSION_DOM_MUTATION` per the report's own suggested taxonomy, not a Marked defect — but not confirmed via an actual clean-profile/incognito test, since this investigation had no interactive browser available.
