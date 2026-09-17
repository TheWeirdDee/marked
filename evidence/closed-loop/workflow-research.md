# Workflow-based execution — research only (Gate 1C instructions §28)

**Nothing was executed for this research.** No workflow was created or run. This draws only on `evidence/keeperhub/seeded-workflows-observed.json`, gathered read-only during Gate 1B (`GET /api/workflows` against the real account, returning its three default onboarding templates).

## What the observed workflow shape can express (inferred, not exhaustively tested)

| Capability | Evidence | Confidence |
|---|---|---|
| Trigger | `{"triggerType": "Schedule", "scheduleCron": "0 * * * *"}` observed | Only a `Schedule` (cron) trigger was observed. A block/event trigger type is plausible (KeeperHub's own docs describe "block or event trigger" generally) but **not directly observed** in any workflow this account has access to. |
| Read a protocol/contract value | `{"actionType": "aave-v3/get-user-account-data", ..., "actionType":"read"}` in `_protocolMeta` | Observed, for Aave v3 specifically. No Governor-family read action type was observed — plausible by the same pattern (a `governor-bravo/state` or similar action type), **not confirmed**. |
| Condition / gating | A `"Condition"` node type with `{group: {logic, rules: [{operator, leftOperand, rightOperand}]}}`, referencing a prior step's output via `{{@step-1:Label.field}}` templating | Observed directly. This shape could plausibly express an ETA-vs-current-time gate, but no time/block-based condition was observed — only a numeric health-factor threshold. |
| A contract *write* node | — | **Not observed at all.** Every node in all three seeded workflows is either a trigger, a read action, a condition, or a notification (Discord/email) action. No write-capable action type appears in any workflow this account has visibility into. |
| Run audit / execution history for a workflow run | — | **Not tested.** No workflow was ever run in Gate 1B or 1C; only the direct `/api/execute/contract-call` surface was exercised. |

## Whether write semantics could be bounded by Marked's policy validator

Not determinable from this research alone — the seeded workflows contain no write node to inspect the shape of. `packages/core`'s `WorkflowPolicyValidator` (PRD §8.9) does not exist yet regardless (it is Gate 4 scope), so this question is moot until both sides exist.

## Conclusion

This research neither confirms nor rules out that workflow-based execution (Option A) could meet or exceed the direct-execute surface's proven bar (blocking simulation, working idempotency, independently-verified caller identity — all proven live in Gate 1B). It only confirms that Option A remains genuinely untested, and that the read/condition/notify shape observed so far gives no evidence either way about write-node semantics. **No switch from the direct-execute surface is made or implied by this research** — see `EXECUTION_SURFACE.md`, still `PARTIAL`.
