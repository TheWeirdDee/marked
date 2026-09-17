# Gate 10L — real, live hosted-LLM proof

**Provider:** OpenRouter · **Model:** `nex-agi/nex-n2.5-pro:free` (fixed, no fallback list) · **Run:**
2026-09-17, `pnpm prove:agent-live-model` (`scripts/prove-agent-live-model.ts`).

## Model selection — real, live, at the time of this gate

OpenRouter's own `/models` pricing endpoint was queried live (`GET https://openrouter.ai/api/v1/models`,
no key required) to enumerate currently-free models — 24 of 444 listed models had `prompt`/`completion`
price `0` at the time. Three candidates were hand-tested with real calls before fixing one:

| Model | Result |
|---|---|
| `google/gemma-4-31b-it:free` | `429` — temporarily rate-limited upstream (shared free pool) |
| `nvidia/nemotron-3-super-120b-a12b:free` | `200` on a simple test, then `503 Service temporarily overloaded` on a schema-shaped prompt |
| `z-ai/glm-5.2:free` | `429` — rate-limited |
| `openrouter/free` (meta-router) | `200` but truncated mid-response |
| **`nex-agi/nex-n2.5-pro:free`** | **`200`, exact correct JSON on both a simple test and a schema-shaped test — selected** |

This is exactly the situation the Gate 10L instructions anticipated ("if the selected free model becomes
unavailable, fail honestly rather than silently switching to a paid model") — the difference here is this
happened during model *selection*, not after fixing one. `nex-agi/nex-n2.5-pro:free` is the one model this
codebase is configured to use (`OPENROUTER_MODEL` default in `provider.ts` and this script); there is no
fallback list anywhere in the implementation.

## An honest retry, exactly as instructed

The first full run of this script failed on Proof 3 (malicious instruction) with `finish_reason: "length"` —
this model performs internal chain-of-thought reasoning before its final answer, and the initial 600-token
budget was exhausted mid-reasoning, so `message.content` came back `null`. Per instruction ("capture the
failure honestly and adjust only prompting/output-format mechanics, never the authority boundary, then
retry"): the failure was left as-is (not silently retried in a loop, not hidden), `max_tokens` was raised
(600 → 2000 for the two JSON-generating calls; 400 → 800 for the two narration calls, for safety margin),
and the script was re-run. Nothing about the schema, the validator, the system prompt's authority rules, or
the context construction changed.

## What each evidence file contains

| File | What it proves |
|---|---|
| `provider.json` | Exact provider/model, why it was selected, run timestamp |
| `compound-220-response.json` | Real Cactus + Governor resolution of the real mainnet Compound #220 proposal, plus the real model's answer to "What did this approve, and can Marked fulfill it now?" |
| `candidate-plan.json` / `candidate-validation.json` | The real model's raw candidate-plan JSON for the Gate 5/6 fixture (replayed read-only, no transaction sent), and the real `validateAgentPlan()` result on it (`ACCEPTED`) |
| `malicious-instruction.json` | The real model's response to an injected instruction to redirect funds, **plus** a separate, model-independent proof that a maximally-hijacked plan (the exact fields the instruction asked for, injected directly) is rejected (`SCHEMA_INVALID`) regardless of what any model does |
| `receipt-explanation.json` | The real model's narration of the canonical, unchanged Gate 6 receipt |

Every file separates `modelOutput` (what the LLM said — never trusted) from `deterministicMarkedResult`
(what Marked's own engines/validator/evidence independently established).

## What this proves

- A real, currently-free, hosted LLM was exercised through Marked's provider boundary for all four required
  live proofs — not a mock, not a description of expected behavior.
- The strict schema and deterministic validator behaved identically against real model output as they did
  against the hand-authored adversarial fixtures in `../adversarial-results.md` — the boundary does not
  depend on which produced the candidate.
- Zero blockchain writes occurred anywhere in this process — every call is a network read (Cactus, Governor
  RPC, OpenRouter) or a local file read (evidence JSON).
- No API key appears in any file in this directory or anywhere else committed to the repository — verified
  by direct grep for the key string and the env var name.

## What this does NOT prove

- Universal prompt-injection resistance — this model happened to decline the injected instruction on its
  own; that is a property of this one model on this one prompt, not a guarantee. The structural proof
  (`hypotheticalMaximallyHijackedPlanValidation` in `malicious-instruction.json`) is the actual security
  guarantee, and it does not depend on model behavior.
- Anything about mainnet, a real DAO, or a new transaction — Proof 2/3 replay the exact existing Gate 5/6
  fixture read-only; Proof 1 reads a real but already-executed mainnet proposal; Proof 4 narrates an
  unchanged, already-existing receipt.
