# @marked/governor

## Responsibility

Owns `GovernorAdapter`. Reads authoritative onchain proposal state and actions directly from the Governor contract (Compound/Uniswap Governor Bravo first, OpenZeppelin Governor/TimelockController where the demo needs it), and constructs the queue/execute lifecycle calls.

Responsibilities per PRD.md §8.2: state, actions, ETA, grace, canonicalize, plan queue, plan execute, detect external execution, caller model for the actual KeeperHub sender.

**This is the execution authorization source.** Not Cactus, not the model. See DEC-002 in `DECISIONS.md`.

## Status

`NOT_IMPLEMENTED`. No chain reads exist in this package yet. This boundary exists for Gate 2 ("Canonical engine") to implement into.

## Planned surface (Gate 2)

- Read live Governor state, actions, ETA, grace.
- Canonicalize the action bundle into the hash domain shapes defined in `packages/core/src/hash-domains.ts`.
- Plan the queue call (Stage A, only when the family requires it) and the execute call (Stage B, after ETA).
- Detect external execution (someone else called `execute()` first) so Marked reconciles instead of racing.
- Caller model: prove the actual KeeperHub sender may call the demo Governor's execute, or block the family (`BLOCKED_CALLER_NOT_AUTHORIZED`).
- Unsupported Governor families stay unsupported — no silent reinterpretation as a supported family.

See PRD.md §8.2, §8.3, §18 Gate 2 for the full spec and pass condition.
