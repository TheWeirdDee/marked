import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, getAddress } from "viem";
import type { HexAddress, PostconditionReadClient, ProposalActionContext } from "@marked/core";
import { ERC20TransferAdapter } from "./erc20-transfer-adapter";
import { PostconditionAdapterError } from "./errors";
import { ERC20_TRANSFER_EVENT_TOPIC0 } from "./erc20-abi";

const TOKEN: HexAddress = getAddress("0x000000000000000000000000000000000000aaa1");
const RECIPIENT: HexAddress = getAddress("0x000000000000000000000000000000000000bbb1");
const SENDER: HexAddress = getAddress("0x000000000000000000000000000000000000ccc1");
const AMOUNT = 60000000000n;
const PRE_BLOCK = "100";
const EXEC_BLOCK = "101";
const TX_HASH = "0xexecutiontxhash00000000000000000000000000000000000000000000" as `0x${string}`;

function encodeTransferCalldata(recipient: HexAddress, amount: bigint) {
  return encodeAbiParameters(
    [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    [recipient, amount],
  );
}

function baseCtx(overrides: Partial<ProposalActionContext> = {}): ProposalActionContext {
  return {
    chainId: 1,
    governor: getAddress("0x000000000000000000000000000000000000ddd1"),
    proposalId: "N/A",
    actionIndex: 0,
    target: TOKEN,
    value: "0",
    signature: "transfer(address,uint256)",
    calldata: encodeTransferCalldata(RECIPIENT, AMOUNT),
    authorizationHash: "0xaaaa",
    preStateBlock: PRE_BLOCK,
    executionBlock: EXEC_BLOCK,
    executionTxHash: TX_HASH,
    verificationBlock: EXEC_BLOCK,
    ...overrides,
  };
}

function pad32(hex: string): `0x${string}` {
  return `0x${hex.replace(/^0x/, "").padStart(64, "0")}` as `0x${string}`;
}

function makeTransferLog(overrides: Partial<{ address: HexAddress; to: HexAddress; value: bigint; logIndex: number }> = {}) {
  return {
    address: overrides.address ?? TOKEN,
    topics: [ERC20_TRANSFER_EVENT_TOPIC0, pad32(SENDER), pad32(overrides.to ?? RECIPIENT)] as [`0x${string}`, `0x${string}`, `0x${string}`],
    data: pad32((overrides.value ?? AMOUNT).toString(16)),
    logIndex: overrides.logIndex ?? 0,
  };
}

/** Builds a fake PostconditionReadClient. `balances` maps blockNumber (as string) to the balance readContract should return at that block. `logs` is what getTransactionReceipt's receipt.logs should contain. */
function fakeClient(params: { balances: Record<string, bigint>; logs?: unknown[]; receiptError?: Error }): PostconditionReadClient {
  const readContract = vi.fn(async (args: { functionName: string; blockNumber?: bigint }) => {
    if (args.functionName === "balanceOf") {
      const key = args.blockNumber!.toString();
      if (!(key in params.balances)) throw new Error(`no fake balance configured for block ${key}`);
      return params.balances[key];
    }
    throw new Error(`unexpected readContract call: ${args.functionName}`);
  });
  const getTransactionReceipt = vi.fn(async () => {
    if (params.receiptError) throw params.receiptError;
    return { logs: params.logs ?? [] };
  });
  const getBlockNumber = vi.fn(async () => 999n);
  return { readContract, getTransactionReceipt, getBlockNumber } as unknown as PostconditionReadClient;
}

async function runFullPipeline(ctx: ProposalActionContext, client: PostconditionReadClient) {
  const pre = await ERC20TransferAdapter.snapshot(client, ctx);
  const expected = ERC20TransferAdapter.deriveExpected(pre, ctx);
  const result = await ERC20TransferAdapter.verify(client, pre, expected, ctx);
  return { pre, expected, result };
}

describe("ERC20TransferAdapter.supports — fails closed", () => {
  it("supports a canonical transfer(address,uint256) action", () => {
    expect(ERC20TransferAdapter.supports(baseCtx())).toBe(true);
  });

  it("does not support transferFrom(address,address,uint256)", () => {
    expect(ERC20TransferAdapter.supports(baseCtx({ signature: "transferFrom(address,address,uint256)", calldata: "0x00" }))).toBe(false);
  });

  it("does not support an unrelated signature", () => {
    expect(ERC20TransferAdapter.supports(baseCtx({ signature: "approve(address,uint256)", calldata: "0x00" }))).toBe(false);
  });

  it("does not support malformed calldata even with the right signature", () => {
    expect(ERC20TransferAdapter.supports(baseCtx({ calldata: "0xdead" }))).toBe(false);
  });

  it("never supports based on proposal-external hints — only signature+calldata are consulted", () => {
    // Same ctx but with an unrelated governor/proposalId/authorizationHash — support must be unaffected by anything other than signature/calldata.
    const ctx = baseCtx({ governor: getAddress("0x000000000000000000000000000000000000fff1"), proposalId: "999", authorizationHash: "0xdead" });
    expect(ERC20TransferAdapter.supports(ctx)).toBe(true);
  });
});

describe("ERC20TransferAdapter — authorization derivation (token/recipient/amount from action data, not prose)", () => {
  it("derives token from ctx.target, and recipient/amount from decoded calldata", async () => {
    const ctx = baseCtx();
    const client = fakeClient({ balances: { [PRE_BLOCK]: 1000n } });
    const pre = await ERC20TransferAdapter.snapshot(client, ctx);
    expect(pre.token).toBe(TOKEN);
    expect(pre.recipient.toLowerCase()).toBe(RECIPIENT.toLowerCase());
    const expected = ERC20TransferAdapter.deriveExpected(pre, ctx);
    expect(expected.authorizedAmount).toBe(AMOUNT);
    expect(expected.expectedRecipientBalanceAfter).toBe(1000n + AMOUNT);
  });

  it("snapshot is block-pinned — throws if ctx.preStateBlock is not set", async () => {
    const ctx = baseCtx({ preStateBlock: undefined });
    const client = fakeClient({ balances: {} });
    await expect(ERC20TransferAdapter.snapshot(client, ctx)).rejects.toBeInstanceOf(PostconditionAdapterError);
  });

  it("verify is block-pinned — throws if ctx.verificationBlock is not set", async () => {
    const ctx = baseCtx({ verificationBlock: undefined });
    const client = fakeClient({ balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT } });
    const pre = await ERC20TransferAdapter.snapshot(client, ctx);
    const expected = ERC20TransferAdapter.deriveExpected(pre, ctx);
    await expect(ERC20TransferAdapter.verify(client, pre, expected, ctx)).rejects.toBeInstanceOf(PostconditionAdapterError);
  });
});

describe("ERC20TransferAdapter.verify — the mutation/refusal matrix (Gate 3 instructions §51)", () => {
  it("EXACT_MATCH: exact recipient delta + matching execution-bound Transfer log verifies", async () => {
    const ctx = baseCtx();
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT },
      logs: [makeTransferLog()],
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(true);
    expect(result.observed.reason).toBe("EXACT_MATCH");
  });

  it("delta - 1 fails (recipient received one unit less than authorized)", async () => {
    const ctx = baseCtx();
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT - 1n },
      logs: [makeTransferLog()],
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
    expect(result.observed.balanceDeltaMatches).toBe(false);
  });

  it("delta + 1 fails (no silent 'close enough' allowance)", async () => {
    const ctx = baseCtx();
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT + 1n },
      logs: [makeTransferLog()],
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
    expect(result.observed.balanceDeltaMatches).toBe(false);
  });

  it("wrong recipient in the Transfer log fails", async () => {
    const ctx = baseCtx();
    const otherRecipient = getAddress("0x000000000000000000000000000000000000eee1");
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT },
      logs: [makeTransferLog({ to: otherRecipient })],
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
    expect(result.observed.transferLogMatches).toBe(false);
  });

  it("wrong amount in the Transfer log fails", async () => {
    const ctx = baseCtx();
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT },
      logs: [makeTransferLog({ value: AMOUNT - 5n })],
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
    expect(result.observed.reason).toBe("TRANSFER_LOG_MISMATCH");
  });

  it("wrong token emitting the log fails (log filtered out entirely)", async () => {
    const ctx = baseCtx();
    const otherToken = getAddress("0x000000000000000000000000000000000000fef1");
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT },
      logs: [makeTransferLog({ address: otherToken })],
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
    expect(result.observed.reason).toBe("TRANSFER_LOG_MISSING");
  });

  it("wrong execution tx (receipt has no matching log) fails", async () => {
    const ctx = baseCtx();
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT },
      logs: [], // receipt for the given tx hash contains no relevant logs
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
    expect(result.observed.reason).toBe("TRANSFER_LOG_MISSING");
  });

  it("missing execution tx hash fails under the hero proof policy, even if the balance delta matches exactly", async () => {
    const ctx = baseCtx({ executionTxHash: undefined });
    const client = fakeClient({ balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT } });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
    expect(result.observed.reason).toBe("TRANSFER_LOG_MISSING");
    expect(result.observed.balanceDeltaMatches).toBe(true); // balance matched — but log evidence is still required
  });

  it("ambiguous matching logs (two indistinguishable Transfer events) fail closed", async () => {
    const ctx = baseCtx();
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT },
      logs: [makeTransferLog({ logIndex: 0 }), makeTransferLog({ logIndex: 1 })],
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
    expect(result.observed.reason).toBe("AMBIGUOUS_TRANSFER_EVIDENCE");
  });

  it("fee-on-transfer-shaped mismatch (log shows full amount, balance delta is smaller) does not verify", async () => {
    const ctx = baseCtx();
    const feeAdjustedDelta = AMOUNT - (AMOUNT * 3n) / 100n; // 3% fee withheld
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + feeAdjustedDelta },
      logs: [makeTransferLog({ value: AMOUNT })], // log still reports the full authorized amount
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
    expect(result.observed.balanceDeltaMatches).toBe(false);
  });

  it("rebasing-shaped mismatch (balance changed independently of the transfer) does not verify", async () => {
    const ctx = baseCtx();
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT + 12345n }, // extra unexplained rebasing delta
      logs: [makeTransferLog()],
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
    expect(result.observed.balanceDeltaMatches).toBe(false);
  });
});

describe("ERC20TransferAdapter — mutation matrix from a known-good baseline (Gate 3 instructions §38)", () => {
  async function goodPipeline() {
    const ctx = baseCtx();
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT },
      logs: [makeTransferLog()],
    });
    return runFullPipeline(ctx, client);
  }

  it("baseline verifies", async () => {
    const { result } = await goodPipeline();
    expect(result.verified).toBe(true);
  });

  it("mutating the authorized recipient (different ctx.calldata recipient) breaks verification", async () => {
    const otherRecipient = getAddress("0x000000000000000000000000000000000000e1e1");
    const ctx = baseCtx({ calldata: encodeTransferCalldata(otherRecipient, AMOUNT) });
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT },
      logs: [makeTransferLog()], // log still pays the ORIGINAL recipient — now mismatched against the authorized one
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
  });

  it("mutating the authorized amount breaks verification", async () => {
    const ctx = baseCtx({ calldata: encodeTransferCalldata(RECIPIENT, AMOUNT + 1n) });
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT }, // chain still only moved the original amount
      logs: [makeTransferLog()],
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
  });

  it("mutating actionIndex alone does not change economic verification (it is a binding label, not part of the economic check)", async () => {
    const ctx = baseCtx({ actionIndex: 7 });
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT },
      logs: [makeTransferLog()],
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(true); // still verifies — actionIndex is a bundle-binding key, checked at the BoundPostcondition layer, not by the adapter itself
  });

  it("mutating executionTxHash to point elsewhere (no matching receipt log) breaks verification", async () => {
    const ctx = baseCtx({ executionTxHash: "0xsomeothertxhash0000000000000000000000000000000000000000000000" as `0x${string}` });
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT },
      logs: [], // the "other" tx's receipt has none of our logs
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
  });

  it("mutating the Transfer log's token breaks verification", async () => {
    const ctx = baseCtx();
    const otherToken = getAddress("0x000000000000000000000000000000000000f0f1");
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT },
      logs: [makeTransferLog({ address: otherToken })],
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
  });

  it("mutating the Transfer log's recipient breaks verification", async () => {
    const ctx = baseCtx();
    const otherRecipient = getAddress("0x000000000000000000000000000000000000d0d1");
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT },
      logs: [makeTransferLog({ to: otherRecipient })],
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
  });

  it("mutating the Transfer log's amount breaks verification", async () => {
    const ctx = baseCtx();
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT },
      logs: [makeTransferLog({ value: AMOUNT - 1n })],
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
  });

  it("mutating the post-state (verification block) balance breaks verification", async () => {
    const ctx = baseCtx();
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 1000n, [EXEC_BLOCK]: 1000n + AMOUNT - 1n },
      logs: [makeTransferLog()],
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
  });

  it("mutating the pre-state balance breaks verification (expected-after shifts, observed does not)", async () => {
    const ctx = baseCtx();
    const client = fakeClient({
      balances: { [PRE_BLOCK]: 2000n, [EXEC_BLOCK]: 1000n + AMOUNT }, // pre-state balance no longer consistent with post-state
      logs: [makeTransferLog()],
    });
    const { result } = await runFullPipeline(ctx, client);
    expect(result.verified).toBe(false);
  });
});
