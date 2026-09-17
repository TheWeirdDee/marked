# Gate 10 — the schema and the deterministic validator

## The schema (`CandidateAgentPlanSchema`)

```ts
export const CandidateAgentPlanSchema = z
  .object({
    version: z.literal(1),
    explanation: z.string().min(1).max(4000),
    proposalSummary: z.string().min(1).max(2000),
    suggestedActionIndexes: z.array(z.number().int().nonnegative()).max(64),
    executionExplanation: z.string().min(1).max(2000),
    verificationExplanation: z.string().min(1).max(2000),
    riskNotes: z.array(z.string().max(1000)).max(20),
    operatorQuestions: z.array(z.string().max(500)).max(10).optional(),
  })
  .strict();
```

`.strict()` is the load-bearing word. Zod's `.strict()` mode rejects any object with a key not in the shape —
so `{...validPlan, amount: "1500000000000000000000"}` fails validation on the presence of `amount` alone,
before the parser even looks at whether `amount` "looks like" a reasonable value. There is no authority field
to sanitize, coerce, or double-check, because there is no authority field in the type at all.

`suggestedActionIndexes` is the only way a candidate plan references anything about the real proposal — a
bare array of integers, resolved against canonical authorization *after* validation, never trusted as
pre-resolved data from the model.

## The validator (`validateAgentPlan`)

Order of checks, and why:

1. **Schema parse** (`SCHEMA_INVALID`) — catches both malformed output and any authority-field injection
   attempt, in one step.
2. **At least one action suggested** (`NO_ACTIONS_SUGGESTED`) — an empty plan is not silently treated as
   "do nothing" or defaulted to action 0.
3. **No duplicate action indexes** (`DUPLICATE_ACTION_INDEX`).
4. **Every referenced index exists on the real proposal** (`ACTION_INDEX_NOT_FOUND`) — bounds-checked against
   `totalActionCount`, a caller-supplied fact from canonical resolution, never from the candidate itself.
5. **Every referenced index has a supported postcondition adapter** (`ACTION_UNSUPPORTED`).
6. **Every action Marked's coverage model requires is actually included** (`REQUIRED_ACTION_OMITTED`) — a
   plan cannot silently drop part of a required bundle and still validate.
7. **The proposal Marked itself considers armable right now** (`FULFILLABILITY_NOT_READY`) — reuses
   `assessFulfillability` (Gate 9R) rather than a second, possibly-drifting armability check.

Only after all seven checks pass does the function return `{ok: true, plan}` — and `plan` is a *newly
constructed* object built field-by-field from the validated candidate, never the candidate object itself
passed through. There is no code path where an extra field on the input candidate could leak into the
validated output.

## Why this lives in `packages/core`, not `apps/web`

Same rule as every other domain primitive in this codebase (`recovery.ts`, `receipt.ts`, `fulfillability.ts`):
zero network I/O, zero dependency on `@marked/{cactus,governor,postconditions}` or any model provider. It can
be — and is — tested with plain synchronous fixture objects standing in for "whatever an LLM might have
said," without ever needing a real model call to prove the boundary holds.
