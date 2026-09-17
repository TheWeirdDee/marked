/**
 * Minimal ERC20 read surface. Deliberately narrow: `balanceOf`/`decimals`/
 * `symbol` for reads, and the standard `Transfer` event for log
 * corroboration — nothing else is needed, and nothing else is claimed to
 * be understood (Gate 3 instructions §22 — narrow support beats fake
 * generality).
 */
export const ERC20_BALANCE_OF_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const ERC20_DECIMALS_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export const ERC20_SYMBOL_ABI = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

/** keccak256("Transfer(address,address,uint256)") — the standard ERC20 Transfer event topic0. */
export const ERC20_TRANSFER_EVENT_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;
