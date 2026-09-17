export type DocBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; text: string }
  | { type: "callout"; kind: "NOTE" | "PROVEN" | "SECURITY" | "LIMITATION"; text: string };

export type DocEntry = {
  slug: string;
  title: string;
  category: string;
  blocks: DocBlock[];
};

export const DOC_CATEGORIES = ["Overview", "Integrations", "Engine", "Reference"] as const;

export const DOCS: DocEntry[] = [
  {
    slug: "introduction",
    title: "Introduction",
    category: "Overview",
    blocks: [
      { type: "p", text: "Marked is a governance fulfillment layer. It sits between a passed DAO proposal and the economic action that proposal authorized, and it does not consider its job done until it has independently verified that action actually occurred." },
      { type: "p", text: "Governance decides. KeeperHub executes. Marked verifies. Each of those three roles stays separate on purpose — see Architecture." },
      { type: "callout", kind: "NOTE", text: "This documentation describes what is actually implemented and proven in this repository, with explicit limitations called out — not an aspirational product spec." },
    ],
  },
  {
    slug: "core-concept",
    title: "Core concept",
    category: "Overview",
    blocks: [
      { type: "h2", text: "Passed ≠ Executed" },
      { type: "p", text: "A governance vote finishing is not the same event as the authorized action happening. Between those two moments sits a timelock, an execution call someone has to remember to send, and — most often skipped — a check that the result actually matched what was authorized." },
      { type: "p", text: "Marked models that gap as a deterministic fulfillment job with an explicit state machine, rather than leaving it as an informal operational task." },
    ],
  },
  {
    slug: "architecture",
    title: "Architecture",
    category: "Overview",
    blocks: [
      { type: "p", text: "Five systems, five distinct responsibilities:" },
      {
        type: "list",
        items: [
          "Cactus — identifies the human governance object (organization, proposal, chain, Governor). Never authoritative for calldata.",
          "The onchain Governor — the sole execution authorization source. Marked reads the action bundle directly from it.",
          "Marked — freezes the authorized action into a commitment, checks eligibility/policy, and independently verifies the outcome.",
          "KeeperHub — the bounded execution surface. Simulates and submits the exact Governor lifecycle call.",
          "The target protocol — where the economic effect actually happens, and where Marked reads the result from.",
        ],
      },
      { type: "callout", kind: "NOTE", text: "packages/governor never imports packages/cactus — the dependency runs one way, matching the authority model." },
    ],
  },
  {
    slug: "three-truths",
    title: "Three truths",
    category: "Overview",
    blocks: [
      { type: "p", text: "A Marked Receipt reconciles three independently-sourced facts, and none of them alone is sufficient:" },
      {
        type: "list",
        items: [
          "Authorized — what governance actually approved, read from the Governor's own storage.",
          "Executed — what actually went onchain, per KeeperHub's execution and the Governor's own post-execution state.",
          "Observed — what actually changed in the target protocol's state, verified independently at a pinned block.",
        ],
      },
      { type: "p", text: "MARKED ✓ only appears when Expected equals Observed and every other required leg (frozen authorization, authorization-at-execution, freshly re-resolved final authorization, Governor final state) agrees too." },
    ],
  },
  {
    slug: "quickstart",
    title: "Quickstart",
    category: "Overview",
    blocks: [
      { type: "code", text: "pnpm install\ncp apps/web/.env.example apps/web/.env.local\npnpm dev" },
      { type: "p", text: "Visit /app, enter a name to open the demo workspace, then New fulfillment to paste a Cactus proposal URL — or use the verified Compound #220 example. Visit /demo for the guided replay of the real Gate 5/6 KeeperHub fulfillment, and /proof/gate6 for the canonical receipt." },
    ],
  },
  {
    slug: "cactus-integration",
    title: "Cactus integration",
    category: "Integrations",
    blocks: [
      { type: "p", text: "Marked resolves a Cactus proposal URL to organization, title, chain, Governor address, and onchain proposal ID — through Cactus's live infrastructure, with a documented SSR fallback when the authenticated GraphQL API's credential is unavailable." },
      { type: "callout", kind: "SECURITY", text: "Only an allowlisted set of Cactus/Tally hostnames may be fetched — the URL parser is the SSRF boundary." },
      { type: "callout", kind: "LIMITATION", text: "Cactus never supplies calldata, actions, or an authorization hash. Marked always re-derives those from the Governor contract itself." },
    ],
  },
  {
    slug: "governor-authorization",
    title: "Governor authorization",
    category: "Integrations",
    blocks: [
      { type: "p", text: "The action-authorization engine reads a Governor Bravo proposal's actions directly from getActions(uint256) — never from a lifecycle call's own calldata, which for Bravo's execute(proposalId) carries only the proposal ID, not the action bundle." },
      { type: "p", text: "Those actions are hashed into a versioned, domain-separated actionAuthorizationHash (MARKED_GOVERNOR_ACTION_AUTHORIZATION_V1), stable across lifecycle transitions (queued → executable → executed) and sensitive to any single-byte change in any action." },
      { type: "callout", kind: "LIMITATION", text: "Governor Bravo only. An unrecognized family fails closed rather than being guessed at." },
    ],
  },
  {
    slug: "keeperhub-execution",
    title: "KeeperHub execution",
    category: "Integrations",
    blocks: [
      { type: "p", text: "Marked's current execution surface is KeeperHub's direct execute-contract-call — Option B. The KeeperHub-managed wallet simulates, then submits, the exact Governor lifecycle call Marked constructed. Marked never sends a raw transaction itself; there is no local broadcaster anywhere in this codebase." },
      { type: "callout", kind: "LIMITATION", text: "Option A (KeeperHub Workflows) is the PRD's documented default but remains untested — see DECISIONS.md DEC-019." },
    ],
  },
  {
    slug: "fulfillment-commitments",
    title: "Fulfillment commitments",
    category: "Engine",
    blocks: [
      { type: "p", text: "Arming a reviewed proposal computes fulfillmentCommitmentHash — a versioned hash binding the frozen authorization, selected actions, postcondition bindings, fulfillment mode, and execution surface. It is a distinct hash domain from actionAuthorizationHash; the commitment references the authorization as an opaque value, never redefines it." },
      { type: "p", text: "Arming re-verifies live Governor authorization immediately before freezing — an arm request whose live authorization no longer matches the reviewed commitment is refused, not silently repaired." },
    ],
  },
  {
    slug: "postconditions",
    title: "Postconditions",
    category: "Engine",
    blocks: [
      { type: "p", text: "ERC20TransferAdapter is the one economic postcondition adapter this project proves. It requires both an exact recipient balance delta and a matching Transfer log bound to the specific execution transaction — either signal alone can be misleading (concurrent transfers, fee-on-transfer tokens)." },
      { type: "callout", kind: "LIMITATION", text: "Only transfer(address,uint256). transferFrom, fee-on-transfer, and rebasing tokens are proven to fail closed, not silently supported." },
    ],
  },
  {
    slug: "lifecycle",
    title: "Lifecycle",
    category: "Engine",
    blocks: [
      { type: "p", text: "The fulfillment state machine is an explicit transition table, not convention — every illegal shortcut (including any direct route to MARKED ✓) is structurally impossible, proven by an exhaustive test that every terminal status has zero legal outgoing edges." },
      { type: "p", text: "Happy path: NEW → ... → REVIEW_READY → ARMED → ... → EXECUTING → RECONCILING → WAITING_FINALITY → VERIFYING_GOVERNOR_STATE → VERIFYING_POSTCONDITION → FULFILLED_VERIFIED." },
    ],
  },
  {
    slug: "refusals",
    title: "Refusals",
    category: "Engine",
    blocks: [
      { type: "p", text: "Every refusal is a named, first-class product result, not a log line. REFUSAL_TIMELOCK_PENDING, REFUSAL_PAYLOAD_MISMATCH, REFUSAL_SIMULATION_REVERT, BLOCKED_CALLER_NOT_AUTHORIZED, and POSTCONDITION_UNSUPPORTED each have their own status and their own plain-English explanation in the UI." },
    ],
  },
  {
    slug: "marked-receipt",
    title: "Marked Receipt",
    category: "Engine",
    blocks: [
      { type: "p", text: "reconcileForMarkedReceipt's input type structurally excludes every single-signal shortcut — there is no field for a bare KeeperHub status string or a bare transaction receipt status anywhere in the type. Six legs must agree: frozen authorization, authorization-at-execution, freshly re-resolved final authorization, selected-action binding, Governor final state, and independently verified required postconditions." },
    ],
  },
  {
    slug: "receipt-verification",
    title: "Receipt verification",
    category: "Engine",
    blocks: [
      { type: "p", text: "Run the canonical verification script yourself:" },
      { type: "code", text: "pnpm verify:gate6" },
      { type: "p", text: "It independently re-resolves Governor authorization, re-decodes the authorized action, re-reads block-pinned balances, and recomputes the receipt hash — reproduced identically across multiple fully separate process invocations." },
    ],
  },
  {
    slug: "agent",
    title: "The Marked Agent",
    category: "Engine",
    blocks: [
      { type: "p", text: "Governance proposals are frequently messy operational objects — a human needs to answer what a proposal authorized, whether it's executable, why Marked is refusing it, and what a receipt actually proves. The Marked Agent exists to make those questions easy to answer. It does not exist to make Marked \"AI-powered\" for its own sake." },
      { type: "h2", text: "The core invariant" },
      { type: "callout", kind: "SECURITY", text: "The agent may understand, explain, and compose. It may never create, modify, or reinterpret governance authority." },
      { type: "h2", text: "Agent authority model" },
      { type: "p", text: "The agent may: explain proposal context, summarize decoded actions, explain fulfillability/refusal states, prepare a candidate fulfillment plan, and summarize a completed receipt. The agent may never independently authorize a chain ID, Governor address, proposal ID, target, recipient, token, amount, calldata, action index, execution function, or approval — those fields do not exist in the schema the agent is even allowed to return." },
      { type: "h2", text: "Untrusted content boundary" },
      { type: "p", text: "Cactus proposal titles, descriptions, and forum text are attacker-reachable — anyone who can get text into a DAO proposal can get text in front of this model. The system prompt tells the model this explicitly, and the structural boundary below means the model ignoring that instruction still produces zero blast radius: the validator downstream never trusts the model to have followed the prompt either." },
      { type: "h2", text: "The pipeline" },
      {
        type: "code",
        text:
          "Untrusted governance text\n" +
          "          ↓\n" +
          "      Agent reasoning\n" +
          "          ↓\n" +
          "    Candidate plan  (strict schema — no authority fields exist)\n" +
          "          ↓\n" +
          "  Deterministic validator  (packages/core/src/agent-plan.ts)\n" +
          "          ↓\n" +
          "      Human review\n" +
          "          ↓\n" +
          " Existing Marked state machine  (unmodified, Gate 4/7)\n" +
          "          ↓\n" +
          "       KeeperHub",
      },
      { type: "h2", text: "Structured output, not parsed prose" },
      { type: "p", text: "The agent is never asked to restate recipient, amount, target, or calldata — it references an existing action by index (suggestedActionIndexes), and the real values are resolved from canonical Governor authorization after validation. The schema is a strict Zod object: any extra field (recipient, amount, target, calldata, governor, proposalId, or anything else) fails validation on that fact alone, before any semantic check runs." },
      { type: "h2", text: "KeeperHub isolation" },
      { type: "p", text: "The agent never receives KeeperHub credentials, never receives the execution Idempotency-Key, and has no tool that can broadcast a transaction. The only path to execution remains the existing authenticated ARM → APPROVE → KeeperHub machinery, unchanged by the agent's existence." },
      { type: "h2", text: "Human approval stays real" },
      { type: "p", text: "\"Agent prepared\", \"human approved\", and \"KeeperHub executed\" are three distinct, separately-recorded events — the product never visually or semantically collapses them into one." },
      { type: "h2", text: "Hallucination handling" },
      { type: "p", text: "If the model states something inconsistent with deterministic state, it is never rendered as authoritative. Structured facts (action references, receipt values, job status) are always re-derived from canonical data after validation, never taken from the model's prose." },
      { type: "h2", text: "Zero-write guarantee" },
      { type: "p", text: "Asking a question, preparing a candidate plan, validating a candidate plan, and explaining a receipt are all read-only — none of these functions import the fulfillment job store's write path or KeeperHub client." },
      { type: "h2", text: "Failure model" },
      { type: "p", text: "If no model provider is configured, every agent surface reports \"Agent unavailable\" plainly rather than fabricating a response. Provider timeouts, malformed JSON, and schema rejections are all typed, non-throwing outcomes that never touch a fulfillment job's state." },
      { type: "h2", text: "Live proof" },
      { type: "p", text: "A real, currently-free OpenRouter model was exercised through this exact boundary during development — explaining the real Compound #220 proposal, preparing a candidate plan for the Gate 5/6 fixture, resisting an injected malicious instruction, and narrating the canonical Gate 6 receipt. See evidence/agent-hardening/live-model/. Run pnpm prove:agent-live-model to reproduce it with your own key." },
      { type: "callout", kind: "LIMITATION", text: "No API key is committed to this repository. A fresh clone defaults to an honest 'Agent unavailable' state until an operator sets OPENROUTER_API_KEY (or ANTHROPIC_API_KEY) themselves — see evidence/agent-hardening/no-model-provider.md." },
    ],
  },
  {
    slug: "recovery",
    title: "Recovery",
    category: "Engine",
    blocks: [
      { type: "p", text: "Ambiguous or unknown execution status can never produce a resubmission — the recovery classifier's return type types the resubmission flag as the literal false, not boolean, so it cannot even be constructed as true. Duplicate-worker protection is a real SQL compare-and-set (a PRIMARY KEY constraint on the execution-claim table), not an application-level race check." },
      { type: "callout", kind: "PROVEN", text: "Restart survival was proven against the actual running app: a hard process kill, a fresh restart, and identical job/event state read back from disk." },
    ],
  },
  {
    slug: "authentication",
    title: "Authentication",
    category: "Engine",
    blocks: [
      { type: "p", text: "Mutating operations (arm, approve, disarm) require an authenticated actor. The current implementation is a documented hackathon demo boundary: a server-only session token plus a required actor name, exposed through an httpOnly cookie set after a simple \"Enter demo workspace\" form — the token itself is never sent to the browser." },
      { type: "callout", kind: "LIMITATION", text: "Not wallet/SIWE authentication. No password hashing, session expiry, or per-user accounts." },
    ],
  },
  {
    slug: "supported-unsupported",
    title: "Supported / unsupported",
    category: "Reference",
    blocks: [
      { type: "list", items: [
        "Governor family: Governor Bravo only.",
        "Economic postcondition: ERC20 transfer(address,uint256) only.",
        "Execution surface: KeeperHub direct execute-contract-call (Option B) only.",
        "Chains: Ethereum mainnet (read) and Sepolia (write proof).",
      ] },
      { type: "p", text: "Anything outside this list fails closed — an unsupported Governor family, an undecodable action, or an unverifiable postcondition all produce a named refusal, never a silent approximation." },
    ],
  },
  {
    slug: "security-model",
    title: "Security model",
    category: "Reference",
    blocks: [
      { type: "p", text: "Authority boundaries: Cactus identifies, never authorizes. The Governor authorizes, never Marked. Marked fulfills, never creates authority. KeeperHub executes, never governs. An LLM/agent may explain and prepare a plan; it may never select recipient, amount, target, or calldata — a plan that disagrees with the deterministic commitment is rejected, not reconciled." },
    ],
  },
  {
    slug: "demo-proof",
    title: "Demo proof",
    category: "Reference",
    blocks: [
      { type: "p", text: "The one live, real, KeeperHub-executed fulfillment this submission proves end-to-end is a controlled Sepolia Governor Bravo deployment — self-deployed, zero real value, not a real DAO, not Cactus-indexed. See /demo for the guided replay and /proof/gate6 for the canonical receipt." },
    ],
  },
  {
    slug: "historical-baseline",
    title: "Historical baseline",
    category: "Reference",
    blocks: [
      { type: "p", text: "\"Passed ≠ Executed\" is a claim about a gap this product exists to close — it should be checkable against real history, not just asserted. This baseline measures, across every proposal Compound Governor Bravo and Uniswap Governor Bravo have actually executed on Ethereum mainnet, the time between a proposal becoming executable and its execution transaction being mined." },
      { type: "callout", kind: "NOTE", text: "This measures timing only. It does not claim why any delay happened, does not claim anyone forgot, and does not claim Marked would have executed anything sooner. The dataset is historical fact; the interpretation stops at \"this gap exists and here is its distribution.\"" },
      { type: "h2", text: "What is measured" },
      { type: "p", text: "fulfillmentInterval = executedAt − executionEligibleAt, where executionEligibleAt is the Timelock eta recorded on the proposal (proposals(id).eta — an onchain timestamp the Governor itself stores at queue time), and executedAt is the block timestamp of the block containing the ProposalExecuted event. Using eta rather than proposal-creation time or queue-transaction time is deliberate: it excludes the mandatory voting period and mandatory timelock delay, since those are protocol-mandated waits, not operational gaps." },
      { type: "h2", text: "Data sources and scope" },
      { type: "p", text: "Two Governor Bravo deployments on Ethereum mainnet: Compound (0xc0Da02939E1441F497fd74F78cE7Decb17B66529) and Uniswap (0x408ED6354d4973f66138C91495F2f2FCbd8724C3). Governor family was verified live via state()/proposals()/initialProposalId() probes for each — the pipeline fails closed rather than assuming Bravo semantics for an unverified contract. All data comes from direct RPC reads (eth_call, eth_getLogs, eth_getBlockByNumber) against onchain events and contract storage — never from Cactus, an indexer, or an analytics site." },
      { type: "h2", text: "A real migration boundary, not a hypothetical one" },
      { type: "p", text: "Both Governors expose a nonzero initialProposalId() — Compound: 42, Uniswap: 8 — marking proposal IDs that belonged to a prior Governor deployment before the current Bravo contract took over ID numbering. Those IDs are excluded (reason MIGRATION_BOUNDARY) rather than misread as though they were the current contract's own proposals." },
      { type: "h2", text: "Inclusion and exclusion" },
      { type: "p", text: "Every proposal ID considered is either included in the final dataset or excluded with a documented reason — never silently dropped: MIGRATION_BOUNDARY, NOT_SUCCEEDED, NEVER_QUEUED, CANCELED, EXPIRED, QUEUED_AWAITING_EXECUTION, MISSING_CANONICAL_EVENT, RPC_DATA_UNAVAILABLE, or NEGATIVE_INTERVAL_INVALID. See evidence/historical/exclusions.json for the full per-DAO counts." },
      { type: "h2", text: "Percentile method" },
      { type: "p", text: "Linear interpolation between closest ranks (rank = p/100 × (n−1)) — the same method NumPy's default np.percentile uses. Documented once and implemented identically in both the primary aggregator and the fully independent verifier, so the two paths cannot silently drift onto different conventions." },
      { type: "h2", text: "Independent verification" },
      { type: "p", text: "A second script (scripts/verify-historical-baseline.ts) reads only the committed, normalized dataset — never the primary aggregator's code — and recomputes every statistic (n, mean, median, p75, p90, p95, max, min, all seven time buckets, overall and per-DAO) with separately-written logic. Reproduce with pnpm verify:historical." },
      { type: "code", text: "pnpm reproduce:historical    # rebuild the dataset from cached or live RPC evidence\npnpm verify:historical       # independent recomputation from the committed dataset\npnpm spot-check:historical   # manual spot-checks against a second, different RPC endpoint" },
      { type: "callout", kind: "LIMITATION", text: "Only these two Governor Bravo deployments on Ethereum mainnet are measured — no other Governor family, chain, or DAO. Proposals still queued and awaiting execution as of the run date are excluded from timing statistics (they have no executedAt yet), not folded into the percentiles." },
    ],
  },
];

export function getDoc(slug: string): DocEntry | undefined {
  return DOCS.find((d) => d.slug === slug);
}
