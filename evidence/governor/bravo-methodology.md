# Governor Bravo methodology — authoritative ABI evidence

Date: 2026-09-15. Per Gate 2 instructions §11–12: "investigate the actual contract ABI/surface rather than guessing" and "do not trust a block explorer as authority." Every method below was read directly from Compound's own reference source, `compound-finance/compound-protocol` (fetched via `gh api` in this session), not inferred from a block explorer's decompiled/guessed ABI.

## Source files read

- `contracts/Governance/GovernorBravoDelegate.sol`
- `contracts/Governance/GovernorBravoInterfaces.sol`

## `getActions(uint256)` — the sole authoritative action-bundle source

```solidity
function getActions(uint proposalId) external view returns (address[] memory targets, uint[] memory values, string[] memory signatures, bytes[] memory calldatas) {
    Proposal storage p = proposals[proposalId];
    return (p.targets, p.values, p.signatures, p.calldatas);
}
```

This is the only function that returns the full action bundle. Nothing else on the contract exposes `targets`/`values`/`signatures`/`calldatas` together — see the `proposals` auto-getter note below for why they can't be read any other way.

## `state(uint256)` — proposal state, and the `ProposalState` enum order

```solidity
function state(uint proposalId) public view returns (ProposalState) {
    require(proposalCount >= proposalId && proposalId > initialProposalId, "GovernorBravo::state: invalid proposal id");
    ...
}
```

The `require` above is what makes an invalid/nonexistent `proposalId` revert — this is how `packages/governor` distinguishes `PROPOSAL_NOT_FOUND` from other failures. Enum order, from `GovernorBravoInterfaces.sol`:

```solidity
enum ProposalState { Pending, Active, Canceled, Defeated, Succeeded, Queued, Expired, Executed }
```
i.e. `0=Pending 1=Active 2=Canceled 3=Defeated 4=Succeeded 5=Queued 6=Expired 7=Executed`. Live-confirmed: Compound #220's `state(220)` returns `7`, matching Cactus's own reported status `"executed"` (Gate 1A) and Gate 1C's independent read.

## `proposals(uint256)` — why it does NOT return the action bundle

```solidity
mapping (uint => Proposal) public proposals;

struct Proposal {
    uint id;
    address proposer;
    uint eta;
    address[] targets;
    uint[] values;
    string[] signatures;
    bytes[] calldatas;
    uint startBlock;
    uint endBlock;
    uint forVotes;
    uint againstVotes;
    uint abstainVotes;
    bool canceled;
    bool executed;
    mapping (address => Receipt) receipts;
}
```

Solidity auto-generates a public getter for a `public mapping`, but that getter **omits any dynamic-array or mapping field** from a struct's return tuple. `targets`/`values`/`signatures`/`calldatas` are all dynamic arrays, and `receipts` is a mapping — none of them come back from `proposals(proposalId)`. What remains, in the struct's declared order: `id, proposer, eta, startBlock, endBlock, forVotes, againstVotes, abstainVotes, canceled, executed`. This is exactly the ABI `packages/governor/src/bravo-abi.ts`'s `BRAVO_PROPOSALS_ABI` encodes, and it is why `getActions(uint256)` — an explicit, separately-written function — is the *only* way to read the action bundle. This directly evidences Gate 2 instructions §5's "most important hash law": Bravo's `execute(proposalId)` calldata carries no information about the authorized actions at all; they live only in contract storage, reachable only via `getActions`.

## `execute`/`queue` — caller authority (read-only finding, not exercised)

```solidity
function execute(uint proposalId) external payable {
    require(state(proposalId) == ProposalState.Queued, "GovernorBravo::execute: proposal can only be executed if it is queued");
    ...
}

function queue(uint proposalId) external {
    require(state(proposalId) == ProposalState.Succeeded, "GovernorBravo::queue: proposal can only be queued if it is succeeded");
    ...
}
```

Neither function contains a caller (`msg.sender`) check — only a proposal-state check. This is the direct evidence behind `packages/governor/src/caller-authority.ts`'s `PERMISSIONLESS` classification. See that file's own evidence string for the caveat: this describes the *reference* source, not a byte-level decompilation confirming any one specific deployed instance matches it exactly.

## `initialProposalId()` — family-detection probe

```solidity
uint public initialProposalId;
```

A public, proposal-independent storage variable, used purely as a Bravo-family capability probe (Gate 2 instructions §23 — never detect family from address/name/Cactus metadata). A contract lacking this getter is not treated as Bravo by `packages/governor/src/family-detection.ts`, regardless of what any indexer calls it.
