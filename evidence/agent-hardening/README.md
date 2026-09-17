# Gate 10 evidence — agent hardening

The core invariant: **the agent may understand, explain, and compose. It may never create, modify, or
reinterpret governance authority.** This is enforced structurally, not by convention.

## What's here

| File | Contents |
|---|---|
| `README.md` | This file |
| `schema-and-validator.md` | The strict Zod schema, the deterministic validator, and why each design choice exists |
| `adversarial-results.md` | Real output of `validateAgentPlan()` against every adversarial input named in the Gate 10 instructions |
| `no-model-provider.md` | Why no live LLM call was made in this environment, and what is/isn't proven as a result |
| `live-agent-ux-proof.md` | Live `curl` transcript proving the agent UX actually renders on the real production build |
| `proof-gate6-with-agent-panel.html` | Rendered snapshot — receipt page's "Explain this receipt" panel (unavailable state, Gate 10) |
| `evidence-page-with-adversarial-demo.html` | Rendered snapshot — real adversarial rejections on `/evidence` |
| `app-new-with-agent-panel.html` | Rendered snapshot — "Marked Agent" panel on the real Compound #220 intake (unavailable state, Gate 10) |
| `live-model/` | **Gate 10L** — real, live hosted-LLM proof: exact provider/model, four real live-call proofs, and rendered snapshots with the agent panel actually live (not "unavailable") |

## Gate 10L — real hosted LLM

`pnpm prove:agent-live-model` performed four real live calls to a real, currently-free OpenRouter model
(`nex-agi/nex-n2.5-pro:free`) — explaining the real (already-executed) Compound #220 proposal, preparing a
candidate plan for the Gate 5/6 fixture, resisting an injected malicious instruction, and narrating the
canonical Gate 6 receipt. See `live-model/README.md` for the full account, including the honest model-selection
process (two other free models were rate-limited/overloaded at the time) and one honest retry (a token-budget
fix, not an authority-boundary change) after the first attempt hit a token limit mid-response.

## Where the actual proof lives

Unlike earlier gates, Gate 10's hero artifact is source code and tests, not a captured transaction:

- `packages/core/src/agent-plan.ts` — the schema (`CandidateAgentPlanSchema`, a `.strict()` Zod object) and
  the deterministic validator (`validateAgentPlan`). Zero network I/O, zero dependency on any model provider.
- `packages/core/src/agent-plan.test.ts` — 32 tests: schema tests (valid plan accepted; nonexistent/duplicate/
  unsupported action rejected; six separate "unknown field" cases for recipient/amount/target/calldata/
  governor/proposalId), an exhaustive authority-boundary sweep (15 forbidden fields, each individually proven
  rejected), and semantic validator cases (no actions suggested, required action omitted, fulfillability not
  ready).
- `apps/web/src/lib/agent/` — the orchestration layer: `context.ts` (sanitized context builder, `authoritative`
  vs `descriptive` split), `prompts.ts` (the prompt-injection-defense system prompt), `provider.ts` (a real,
  working Anthropic Messages API client plus the vendor-neutral `MarkedAgentProvider` interface), `actions.ts`
  (four read-only Server Actions: ask about a proposal, prepare a candidate plan, ask about a fulfillment, ask
  about the canonical receipt).
- `apps/web/src/lib/agent/actions.test.ts` — 9 tests: the actual current "unavailable" state (no provider
  configured) fails closed for all four actions without throwing; with a mocked provider, a benign candidate
  validates and a hallucinated one (extra `amount` field) is rejected by the schema; asking a question about
  an existing job never mutates that job's status.
- `apps/web/src/components/agent/AdversarialDemo.tsx` — not a description of the validator's behavior. This
  component calls the real, deployed `validateAgentPlan()` against hand-crafted adversarial inputs at page
  render time (`/evidence`), server-side. If the validator were ever weakened, this demo would show the
  (wrong) accepted result — it cannot silently drift from reality.

## Regression

Gate 2/5/6 canonical evidence is unchanged — Gate 10 added no new package that touches Cactus, the Governor,
KeeperHub, or postcondition verification, and made zero blockchain writes.
