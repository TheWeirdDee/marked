# Gate 9 evidence — judge-facing product UI

## What's here

This environment has no browser-screenshot tool available, so instead of image screenshots this directory
holds the actual prerendered HTML output of `pnpm --filter @marked/web build` — the literal server-rendered
markup a browser receives, with every real evidence value already baked in. This is arguably stronger
evidence than a screenshot: it can be grepped directly for the exact hash/address strings it renders.

| File | Contents |
|---|---|
| `README.md` | This file |
| `landing-rendered.html` | `/` — the hero/positioning page |
| `demo-rendered.html` | `/demo` — the full judge journey (Cactus lane, Sepolia lane, authorization, postcondition, timeline, MARKED ✓, receipt, recomputability) |

## How to regenerate

```bash
pnpm --filter @marked/web build
cp apps/web/.next/server/app/index.html evidence/product-ui/landing-rendered.html
cp apps/web/.next/server/app/demo.html evidence/product-ui/demo-rendered.html
```

## Independent confirmation these are not fabricated

```bash
grep -c "MARKED" evidence/product-ui/demo-rendered.html
# 7

grep -o "0x332ea2320ba4a0af131cfbfd78bfd55418b2eca6746df3d722c9eed2c77219c4" evidence/product-ui/demo-rendered.html
# matches — the real Gate 6 receiptHash

grep -o "0x49ac3ebbd7e957cb8b57e0e1dcc0e2e24243b2ae72c34cc1b839c7fe8a81d7cb" evidence/product-ui/demo-rendered.html
# matches — the real Gate 5 execution transaction hash
```

## Seeing it live instead

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm dev
# visit http://localhost:3000/demo
```

The Recovery sandbox section at the bottom of `/demo` is the one part of the page that is genuinely live
and interactive (real `fetch` calls to real, authenticated API routes) rather than a static render of
recorded evidence — see `evidence/recovery-hardening/` for what it proves.
