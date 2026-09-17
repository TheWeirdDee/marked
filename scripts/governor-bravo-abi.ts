/**
 * Minimal read-only Governor Bravo ABI fragment — enough to prove a
 * proposal id is plausibly queryable from a given Governor address. This
 * is NOT the Gate 2 canonical action-bundle reconstruction; it reads only
 * `proposals(uint256)`, which every Compound-style Governor Bravo exposes.
 *
 * Both Gate 1A fixtures (Compound #220, Uniswap #20) resolved to a
 * governor tagged `"type": "governorbravo"` by Cactus's own data — see
 * evidence/cactus/discovery.md — so this single ABI fragment covers both.
 */
export const GOVERNOR_BRAVO_MINIMAL_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
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
