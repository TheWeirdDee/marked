# Gate 10 — live proof the agent UX actually renders

Captured 2026-09-16 against `pnpm --filter @marked/web build && pnpm --filter @marked/web start`, via `curl`.

## `GET /proof/gate6`

The public receipt page's "Explain this receipt" panel renders. Since no model provider is configured in
this environment, it correctly shows the honest unavailable state rather than fabricating a response:

```
Explain this receipt
Agent unavailable — the model provider is not configured on this server...
```

Saved: `proof-gate6-with-agent-panel.html`.

## `GET /evidence`

The adversarial demo section renders real, server-computed rejections — 4 example cards, each showing a
`Rejected` badge and the real refusal code (`SCHEMA_INVALID` ×3, `ACTION_INDEX_NOT_FOUND` ×1 across the
visible DOM and the embedded RSC payload). This is the exact same `validateAgentPlan()` function
`prove-agent-hardening.ts` calls, invoked instead at page-render time.

Saved: `evidence-page-with-adversarial-demo.html`.

## `GET /app/new?url=<real Compound #220 URL>` (with a session cookie)

The proposal-intake page's "Marked Agent" panel renders with its `Read + prepare` / `No execution authority`
labels, right alongside the real Cactus/Governor resolution result for the same real proposal already proven
live in Gate 9R (`evidence/product-ui/live-intake-proof.md`).

Saved: `app-new-with-agent-panel.html`.

## `GET /docs/agent`

Renders; contains the literal core-invariant sentence ("understand, explain, and compose").

## What this proves

The agent UX is not dead code behind a feature flag nobody exercises — it is mounted, rendered, and reachable
on the real production build, in the real state this deployment is actually in (no model key configured).
