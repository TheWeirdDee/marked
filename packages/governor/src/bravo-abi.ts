/**
 * Governor Bravo ABI fragments, taken directly from Compound's own
 * reference source (`compound-finance/compound-protocol`,
 * `contracts/Governance/GovernorBravoDelegate.sol` and
 * `GovernorBravoInterfaces.sol`), fetched and read in this gate — not
 * guessed, not taken from a block explorer's inferred ABI. See
 * evidence/governor/bravo-methodology.md for the exact source excerpts.
 */

/**
 * `getActions(uint256) external view returns (address[] targets, uint[]
 * values, string[] signatures, bytes[] calldatas)` — the ONLY authoritative
 * source of a Bravo proposal's action bundle. Confirmed from source:
 * `Proposal storage p = proposals[proposalId]; return (p.targets,
 * p.values, p.signatures, p.calldatas);`
 */
export const BRAVO_GET_ACTIONS_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "getActions",
    outputs: [
      { internalType: "address[]", name: "targets", type: "address[]" },
      { internalType: "uint256[]", name: "values", type: "uint256[]" },
      { internalType: "string[]", name: "signatures", type: "string[]" },
      { internalType: "bytes[]", name: "calldatas", type: "bytes[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * `state(uint256) public view returns (ProposalState)`. Enum order,
 * confirmed from source (`GovernorBravoInterfaces.sol`):
 * 0 Pending, 1 Active, 2 Canceled, 3 Defeated, 4 Succeeded, 5 Queued,
 * 6 Expired, 7 Executed.
 */
export const BRAVO_STATE_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "state",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const BRAVO_PROPOSAL_STATE_LABELS = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
] as const;

export function bravoStateLabel(state: number): string {
  return BRAVO_PROPOSAL_STATE_LABELS[state] ?? `UNKNOWN_STATE(${state})`;
}

/**
 * `mapping(uint => Proposal) public proposals;`. Solidity's auto-generated
 * getter for a struct containing dynamic array fields (targets/values/
 * signatures/calldatas) and a mapping (receipts) omits those fields from
 * its return tuple — confirmed from source. What remains, in declared
 * order: id, proposer, eta, startBlock, endBlock, forVotes, againstVotes,
 * abstainVotes, canceled, executed.
 */
export const BRAVO_PROPOSALS_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "proposals",
    outputs: [
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "address", name: "proposer", type: "address" },
      { internalType: "uint256", name: "eta", type: "uint256" },
      { internalType: "uint256", name: "startBlock", type: "uint256" },
      { internalType: "uint256", name: "endBlock", type: "uint256" },
      { internalType: "uint256", name: "forVotes", type: "uint256" },
      { internalType: "uint256", name: "againstVotes", type: "uint256" },
      { internalType: "uint256", name: "abstainVotes", type: "uint256" },
      { internalType: "bool", name: "canceled", type: "bool" },
      { internalType: "bool", name: "executed", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * `uint public initialProposalId;` — a Bravo-specific, proposal-independent
 * public storage variable used here purely as a family-detection probe
 * (Gate 2 instructions §23: identify family from contract capability, not
 * from address/name/Cactus metadata). A contract that does not expose this
 * getter is not treated as Bravo, regardless of what any indexer calls it.
 */
export const BRAVO_INITIAL_PROPOSAL_ID_ABI = [
  {
    inputs: [],
    name: "initialProposalId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * `execute(uint256) external payable` and `queue(uint256) external` — used
 * only to type the future (not-yet-sent) lifecycle call plan. Confirmed
 * from source that neither has a caller `require()` — see
 * `packages/governor/src/caller-authority.ts`.
 */
export const BRAVO_LIFECYCLE_CALL_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "execute",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "queue",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
