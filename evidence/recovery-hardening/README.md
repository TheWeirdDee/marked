# Gate 7 evidence — recovery hardening

Making the Gate 5/6 proven fulfillment path resilient to ordinary runtime failures — crashes, timeouts,
ambiguous KeeperHub responses, external execution, reorgs, and duplicate workers — without lying about
state, without duplicate execution, and without losing state. No new Governor, no new proposal, no new
KeeperHub transaction was created anywhere in this gate.

## Files in this directory

| File | Contents |
|---|---|
| `README.md` | This file |
| `persistence.md` | Part 17 — why `node:sqlite`, schema, honesty boundary |
| `authentication.md` | Part 18 — the demo session-token auth boundary, why not wallet/SIWE yet |
| `recovery-scenarios.md` | Part 16 — scenarios A-I, one section each, mapped to code + tests |
| `live-restart-proof.md` | A real transcript: kill the running app, restart it, prove state survived |
| `regression.md` | Cross-gate regression — Gate 2/5/6 evidence confirmed unchanged, full test/build results |

## The one-sentence summary

Every job, event, and execution claim is durable across a real process restart; no code path can express
resubmitting an ambiguous execution or claiming a request hash a peer has already claimed; every mutating
operation requires a real authenticated actor, recorded on the event. See `DEC-021` for the full decision
record and `CLAIMS.md`'s Gate 7 section for exactly what is and is not claimed.
