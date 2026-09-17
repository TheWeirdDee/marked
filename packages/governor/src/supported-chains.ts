import { mainnet, sepolia, baseSepolia, optimism } from "viem/chains";
import type { Chain } from "viem";

/**
 * Gate 12 §CACTUS-LIVE-001 — the single source of truth for "which chains
 * can Marked's Governor engine open a real RPC client against at all."
 *
 * Before this file existed, this exact `Record<number, Chain>` map was
 * independently duplicated in three places (`packages/governor/src/resolve.ts`,
 * `packages/governor/src/verify-existence.ts`, `apps/web/src/lib/governance.ts`)
 * — and one of the three copies (the web app's) fell out of sync, missing
 * Optimism (chainId 10) while the others didn't need it yet either. A real
 * Cactus-indexed Optimism proposal then failed with `UNSUPPORTED_CHAIN`
 * from that one out-of-date copy — not because Optimism is architecturally
 * unsupportable, but because nothing kept three independent lists in sync.
 * See `evidence/system-audit/cactus-live-compatibility.md`.
 *
 * Being in this list means "Marked can open a live, read-only RPC client
 * here and attempt a real Governor-family probe" — it does NOT mean every
 * Governor found on this chain is a supported family. A chain being listed
 * here converts a possible `UNSUPPORTED_CHAIN` (an infrastructure gap, "we
 * never tried") into whatever the live probe actually finds — most often
 * `GOVERNOR_BRAVO` (supported) or `UNSUPPORTED_GOVERNOR_FAMILY` (a real,
 * specific, accurate diagnosis) — which is a strictly more honest failure
 * mode than an infrastructure-limited guess.
 */
export const SUPPORTED_CHAINS: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  84532: baseSepolia,
  10: optimism,
};

export function chainById(chainId: number): Chain | undefined {
  return SUPPORTED_CHAINS[chainId];
}
