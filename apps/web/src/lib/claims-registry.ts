export type ClaimStatus = "PROVEN" | "TARGET" | "BLOCKED" | "REJECTED";

export type GateCard = {
  gate: string;
  title: string;
  status: ClaimStatus;
  summary: string;
  evidence: string[];
  reproduceCommand?: string;
  limitation: string;
};

/** Condensed from CLAIMS.md — every row here has a fuller entry there and in evidence/. */
export const GATE_CARDS: GateCard[] = [
  {
    gate: "Gate 1A",
    title: "Cactus resolution",
    status: "PROVEN",
    summary: "Real mainnet proposals (Compound #220, Uniswap #20) resolved to organization/chain/Governor/onchain proposal ID through live Cactus infrastructure, independently cross-checked onchain.",
    evidence: ["evidence/cactus/compound-220/", "evidence/cactus/uniswap-20/"],
    reproduceCommand: "pnpm prove:cactus",
    limitation: "Resolved via the documented SSR fallback, not the authenticated official GraphQL API (no API key available in this environment).",
  },
  {
    gate: "Gate 1B",
    title: "KeeperHub execution surface",
    status: "PROVEN",
    summary: "Direct execute-contract-call on Sepolia, with explicit typed authorization, full local pre-network validation, and an independently-verified onchain write.",
    evidence: ["evidence/keeperhub/probe-001-erc20-approve/"],
    limitation: "Only Option B (direct contract-call) is proven — Option A (KeeperHub Workflows) is untested.",
  },
  {
    gate: "Mode C",
    title: "Claim boundary (Cactus × KeeperHub)",
    status: "PROVEN",
    summary: "Cactus integration (live mainnet reads) and KeeperHub fulfillment (controlled Sepolia writes) are proven separately and never narrated as one continuous closed loop.",
    evidence: ["evidence/closed-loop/classification.md"],
    limitation: "No Cactus-indexed proposal has ever been executed through KeeperHub end to end.",
  },
  {
    gate: "Gate 2",
    title: "Governor authorization engine",
    status: "PROVEN",
    summary: "A deterministic, versioned actionAuthorizationHash is reconstructed directly from a Governor Bravo contract's own storage — never from Cactus, prose, or an LLM.",
    evidence: ["evidence/governor/compound-220/"],
    reproduceCommand: "pnpm prove:governor",
    limitation: "Governor Bravo only — no other Governor family is implemented.",
  },
  {
    gate: "Gate 3",
    title: "Economic postcondition (ERC20TransferAdapter)",
    status: "PROVEN",
    summary: "Verifies an exact recipient balance delta plus an execution-bound Transfer log. Proven to refuse on every tested mismatch, including fee-on-transfer and rebasing tokens.",
    evidence: ["evidence/postconditions/historical-fixture/"],
    reproduceCommand: "pnpm prove:erc20-postcondition",
    limitation: "transfer(address,uint256) only — no transferFrom, fee-on-transfer, or rebasing support.",
  },
  {
    gate: "Gate 4",
    title: "Fulfillment commitment & state machine",
    status: "PROVEN",
    summary: "A versioned fulfillmentCommitmentHash freezes the reviewed authorization. Every illegal state-machine shortcut, including any route to MARKED ✓, is structurally impossible.",
    evidence: ["evidence/fulfillment-commitment/"],
    reproduceCommand: "pnpm prove:fulfillment-commitment",
    limitation: "No production (Postgres/Drizzle) persistence backend — see Gate 7.",
  },
  {
    gate: "Gate 5",
    title: "KeeperHub Governor lifecycle fulfillment",
    status: "PROVEN",
    summary: "A controlled Sepolia Governor Bravo proposal genuinely passed propose → vote → queue, and KeeperHub called the Governor's own execute(proposalId).",
    evidence: ["evidence/lifecycle-fulfillment/"],
    limitation: "One controlled proposal, one controlled Governor — not a real DAO.",
  },
  {
    gate: "Gate 6",
    title: "Independent economic verification & Marked Receipt",
    status: "PROVEN",
    summary: "The first legal MARKED ✓ — every fact independently re-derived from live chain state, reconciled across six required legs with no single-signal shortcut possible.",
    evidence: ["evidence/marked-receipt/"],
    reproduceCommand: "pnpm verify:gate6",
    limitation: "Covers exactly one controlled Sepolia fixture.",
  },
  {
    gate: "Gate 7",
    title: "Recovery hardening & authentication",
    status: "PROVEN",
    summary: "Real SQLite-backed persistence surviving an actual process restart; ambiguous-execution resubmission is structurally excluded; duplicate-worker protection is a real DB compare-and-set; mutating routes require an authenticated actor.",
    evidence: ["evidence/recovery-hardening/"],
    limitation: "Single-file/single-process database, not distributed infrastructure. Demo session-token auth, not wallet/SIWE.",
  },
  {
    gate: "Gate 10",
    title: "Agent hardening — the deterministic boundary",
    status: "PROVEN",
    summary: "A strict, unknown-field-rejecting schema plus a deterministic validator mean an LLM's output can never itself become an armable plan — recipient/amount/target/calldata/governor/proposalId don't exist as fields the agent can supply at all. Prompt injection in governance text is treated as inert data by construction.",
    evidence: ["evidence/agent-hardening/"],
    reproduceCommand: "pnpm --filter @marked/core test -- agent-plan",
    limitation: "The deterministic validator is proven via hand-authored fixtures standing in for both benign and adversarial model output — see Gate 10L for the same boundary proven against a real model's actual output.",
  },
  {
    gate: "Gate 10L",
    title: "Real free LLM proof",
    status: "PROVEN",
    summary: "A real, currently-free OpenRouter model (nex-agi/nex-n2.5-pro:free, chosen by live-testing OpenRouter's actual current lineup) explained the real Compound #220 proposal, prepared a candidate plan that passed the unmodified deterministic validator, responded to an injected malicious instruction, and narrated the canonical Gate 6 receipt.",
    evidence: ["evidence/agent-hardening/live-model/"],
    reproduceCommand: "pnpm prove:agent-live-model",
    limitation: "A fresh clone of this repository ships with no API key committed — this claim is proven by evidence captured during development, not by a default-configured live deployment.",
  },
  {
    gate: "Gate 8",
    title: "Historical Governor fulfillment baseline",
    status: "PROVEN",
    summary: "Across 353 executed Compound + Uniswap Governor Bravo proposals on Ethereum mainnet, the interval from execution-eligible (Timelock eta) to actually-executed has a median of 2.2 minutes, a P90 of 12.96 hours, and a max of 231.14 hours (Uniswap #20) — independently recomputed and spot-checked against a second RPC.",
    evidence: ["evidence/historical/README.md", "evidence/historical/spot-checks.md", "evidence/historical/historical-governor-fulfillment.json"],
    reproduceCommand: "pnpm reproduce:historical && pnpm verify:historical",
    limitation: "Only these two Governor Bravo deployments on Ethereum mainnet are measured. Timing only — no claim is made about why any interval was long, or that Marked would have executed sooner.",
  },
];

export const NOT_CLAIMED = [
  "Mainnet execution",
  "Real DAO execution",
  "Cactus-indexed controlled proposal",
  "KeeperHub Workflows (Option A)",
  "AUTO mode live execution",
  "Private routing",
  "Universal Governor support",
  "Universal ERC20 semantics",
  "Production-grade distributed reliability",
  "Wallet/SIWE authentication",
  "Autonomous governance execution",
  "Agent wallet or KeeperHub authority",
  "Universal prompt-injection immunity",
  "A live agent by default on a fresh clone (no API key is committed)",
];
