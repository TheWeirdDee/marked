# Gate 9R — live proof of the real `/app/new` proposal-intake pipeline

Captured 2026-09-16 against `pnpm --filter @marked/web build && pnpm --filter @marked/web start`
(port 3000), using `curl` — not a unit test, not a mock, a real running app.

## What was tested

1. **`GET /app` unauthenticated** → `200`, renders the demo-workspace login gate (not a 401/error page).
2. **`GET /app` with a manually-set session cookie** (`marked_demo_session=1; marked_demo_actor=judge-live-test`)
   → `200`, dashboard renders — proving the cookie-based session path (Part 33) actually gates `/app/*`.
3. **`GET /app/new?url=https://www.tally.xyz/gov/compound/proposal/220`** (the real Gate 1A example) → `200`.
   The response HTML contains:
   - `targetReserves` — a fragment of the real proposal title, proving the live Cactus adapter actually
     resolved this URL (not a fixture).
   - `0xc0Da02939E1441F497fd74F78cE7Decb17B66529` — the real Compound Governor address, matching
     `evidence/governor/compound-220/` exactly, proving the live Governor resolution engine ran.
   - `Already executed` — the correct fulfillability outcome, since this real mainnet proposal really was
     executed. `Review fulfillment` (the Arm-path button) appears **zero times** in the response — duplicate
     suppression (Part 29) is real, not simulated.
4. **`GET /app/new?url=https://example.com/not-a-real-proposal`** → `200`, page renders `Resolution failed` /
   `Cactus could not resolve this URL` — the host-allowlist SSRF boundary (`packages/cactus/src/url.ts`,
   proven since Gate 1A) still fails closed when reached through this new UI path.
5. **`GET /app/fulfillments/nonexistent-id`** → `404` (Next's `notFound()`).
6. **`GET /proof/gate6`** → `200`; **`GET /proof/nonexistent`** → `404`.
7. **`GET /docs`, `GET /docs/recovery`, `GET /evidence`** → all `200`.

## Saved snapshots

`landing-rendered.html`, `proof-gate6-rendered.html`, `demo-rendered.html`, `evidence-rendered.html`,
`docs-rendered.html`, and `app-new-live-intake-compound-220.html` (the response from test 3 above) are all
captured in this directory — the literal server-rendered markup, independently grep-confirmed to contain the
real Gate 5 tx hash (`0x49ac3ebbd7e957cb8b57e0e1dcc0e2e24243b2ae72c34cc1b839c7fe8a81d7cb`) and Gate 6 receipt
hash (`0x332ea2320ba4a0af131cfbfd78bfd55418b2eca6746df3d722c9eed2c77219c4`).

## What this proves

- The `/app/new` intake pipeline is not a mock — it performs real Cactus resolution and real Governor
  authorization/eligibility resolution against live infrastructure, exactly as Gates 1A and 2 already proved
  those engines do in isolation.
- `assessFulfillability`'s `ALREADY_EXECUTED` classification, and the UI's decision to hide the Arm control for
  it, both work correctly against a real, independently-resolved mainnet proposal — not a synthetic test
  fixture.
- No new onchain write, KeeperHub call, Governor deployment, or proposal was created by any of this — every
  request above is read-only.
