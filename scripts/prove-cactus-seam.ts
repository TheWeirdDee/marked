/**
 * Gate 1A live reproduction: proves (or disproves) that Marked can start
 * from a real Cactus proposal URL and deterministically resolve it to a
 * real, independently-queryable onchain governance object.
 *
 * Run with: pnpm prove:cactus
 *
 * This script performs real network I/O (Cactus resolution + a read-only
 * Ethereum mainnet RPC call). It is intentionally NOT part of `pnpm test`
 * — see PRD.md §18 Gate 1A and the Gate 1A instructions §18
 * "Live integration tests vs unit tests".
 *
 * It never forces a PASS. Every printed result reflects what actually
 * happened on this run.
 */
import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { CactusResolutionError, resolveCactusProposal, type ResolveCactusProposalResult } from "@marked/cactus";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GOVERNOR_BRAVO_MINIMAL_ABI } from "./governor-bravo-abi";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EVIDENCE_ROOT = join(REPO_ROOT, "evidence", "cactus");

const PUBLIC_FALLBACK_RPC_URL = "https://ethereum-rpc.publicnode.com";

type Fixture = {
  label: string;
  evidenceDir: string;
  url: string;
  expectedChainId: number;
  expectedOnchainProposalId: string;
};

const FIXTURES: Fixture[] = [
  {
    label: "Compound #220",
    evidenceDir: "compound-220",
    url: "https://www.tally.xyz/gov/compound/proposal/220",
    expectedChainId: 1,
    expectedOnchainProposalId: "220",
  },
  {
    label: "Uniswap #20",
    evidenceDir: "uniswap-20",
    url: "https://www.tally.xyz/gov/uniswap/proposal/20",
    expectedChainId: 1,
    expectedOnchainProposalId: "20",
  },
];

function rpcUrl(): { url: string; source: "ETHEREUM_RPC_URL" | "public_fallback" } {
  const configured = process.env["ETHEREUM_RPC_URL"];
  if (configured) return { url: configured, source: "ETHEREUM_RPC_URL" };
  return { url: PUBLIC_FALLBACK_RPC_URL, source: "public_fallback" };
}

async function onchainSanityCheck(params: {
  governor: Address;
  onchainProposalId: string;
  rpcUrl: string;
}): Promise<
  | { ok: true; hasCode: true; proposalReadable: true; onchainReportedId: string; onchainExecuted: boolean }
  | { ok: false; hasCode: boolean; proposalReadable: boolean; reason: string }
> {
  const client = createPublicClient({ chain: mainnet, transport: http(params.rpcUrl) });

  const bytecode = await client.getCode({ address: params.governor });
  const hasCode = !!bytecode && bytecode !== "0x";
  if (!hasCode) {
    return { ok: false, hasCode: false, proposalReadable: false, reason: "No contract code at governor address." };
  }

  try {
    const result = await client.readContract({
      address: params.governor,
      abi: GOVERNOR_BRAVO_MINIMAL_ABI,
      functionName: "proposals",
      args: [BigInt(params.onchainProposalId)],
    });
    const [onchainId, , , , , , , , , executed] = result;
    return {
      ok: true,
      hasCode: true,
      proposalReadable: true,
      onchainReportedId: onchainId.toString(),
      onchainExecuted: executed,
    };
  } catch (err) {
    return {
      ok: false,
      hasCode: true,
      proposalReadable: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function runFixture(fixture: Fixture, rpc: { url: string; source: string }): Promise<boolean> {
  console.log(`\n[${fixture.label}]`);
  const evidenceDir = join(EVIDENCE_ROOT, fixture.evidenceDir);
  ensureDir(evidenceDir);

  writeJson(join(evidenceDir, "input.json"), {
    proposalUrl: fixture.url,
    fetchedAt: new Date().toISOString(),
  });

  let result: ResolveCactusProposalResult;
  try {
    result = await resolveCactusProposal({ proposalUrl: fixture.url });
  } catch (err) {
    const code = err instanceof CactusResolutionError ? err.code : "UNKNOWN";
    const message = err instanceof Error ? err.message : String(err);
    console.log(`Result: FAIL`);
    console.log(`Reason: ${code} — ${message}`);
    writeJson(join(evidenceDir, "failure.json"), {
      errorCode: code,
      errorMessage: message,
      sourceAttempted: fixture.url,
      timestamp: new Date().toISOString(),
    });
    return false;
  }

  const { resolved, sanitizedPageProps } = result;
  console.log(`Source: ${resolved.provenance.sourceClassification} (${resolved.provenance.resolutionMethod})`);
  console.log(`Organization: ${resolved.organization.name} (${resolved.organization.slug ?? "no slug"})`);
  console.log(`Title: ${resolved.proposal.title}`);
  console.log(`Chain: ${resolved.chain.chainId}`);
  console.log(`Governor: ${resolved.governor.address} (${resolved.governor.kind ?? "unknown kind"})`);
  console.log(`Onchain proposal ID: ${resolved.proposal.onchainProposalId}`);

  writeJson(join(evidenceDir, "resolved.json"), resolved);
  if (sanitizedPageProps) {
    writeJson(join(evidenceDir, "raw-response.sanitized.json"), sanitizedPageProps);
  }

  // Cross-check 1: does the resolved chain/proposal id match what this
  // fixture expects going in? (Not a rubber stamp — a real mismatch here
  // would mean Cactus resolved us to the wrong object entirely.)
  const chainMatches = resolved.chain.chainId === fixture.expectedChainId;
  const idMatches = resolved.proposal.onchainProposalId === fixture.expectedOnchainProposalId;

  // Cross-check 2: minimal independent onchain read.
  const onchain = await onchainSanityCheck({
    governor: resolved.governor.address,
    onchainProposalId: resolved.proposal.onchainProposalId,
    rpcUrl: rpc.url,
  });

  writeJson(join(evidenceDir, "onchain-check.json"), {
    rpcUrl: rpc.url,
    rpcSource: rpc.source,
    governor: resolved.governor.address,
    requestedOnchainProposalId: resolved.proposal.onchainProposalId,
    result: onchain,
    checkedAt: new Date().toISOString(),
  });

  console.log(`Onchain check (RPC: ${rpc.source}):`);
  console.log(`  Contract code present: ${onchain.hasCode ? "YES" : "NO"}`);
  console.log(`  proposals(${resolved.proposal.onchainProposalId}) readable: ${onchain.proposalReadable ? "YES" : "NO"}`);

  let idCrossCheck: "MATCH" | "MISMATCH" | "N/A" = "N/A";
  if (onchain.ok) {
    idCrossCheck = onchain.onchainReportedId === resolved.proposal.onchainProposalId ? "MATCH" : "MISMATCH";
    console.log(`  Onchain proposals(id).id vs Cactus onchainProposalId: ${idCrossCheck}`);
    console.log(`  Onchain executed flag: ${onchain.onchainExecuted} (Cactus-reported status: ${resolved.proposal.status ?? "unknown"})`);
  } else {
    console.log(`  Onchain read failed: ${onchain.reason}`);
  }

  const overallMatch = chainMatches && idMatches && onchain.ok && idCrossCheck === "MATCH";
  console.log(`Match status: ${overallMatch ? "MATCH" : "MISMATCH"}`);
  console.log(`Result: ${overallMatch ? "PASS" : "FAIL"}`);

  return overallMatch;
}

async function main() {
  console.log("MARKED — CACTUS SEAM PROOF");
  const rpc = rpcUrl();
  console.log(`(Using Ethereum RPC: ${rpc.source === "ETHEREUM_RPC_URL" ? "configured ETHEREUM_RPC_URL" : rpc.url + " [public fallback, documented in evidence]"})`);

  ensureDir(EVIDENCE_ROOT);

  let passCount = 0;
  for (const fixture of FIXTURES) {
    const ok = await runFixture(fixture, rpc);
    if (ok) passCount++;
  }

  console.log(`\nGate result:`);
  console.log(`${passCount}/${FIXTURES.length} resolved`);

  process.exitCode = passCount === FIXTURES.length ? 0 : 1;
}

main().catch((err) => {
  console.error("Reproduction script crashed:", err);
  process.exitCode = 1;
});
