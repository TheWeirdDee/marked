#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { verifyReceipt, VerifyNotImplementedError } from "./verify";

const HELP_TEXT = `marked — Marked CLI

Governance is not finished when it passes. It is finished when it is Marked.

Usage:
  marked verify <receipt_id>   Recompute a published Marked receipt (no private keys required)
  marked --help                Show this help text

Status:
  This is a Gate 0 scaffold. "verify" is not implemented yet — it reports
  that explicitly rather than returning a fake result. See GATES.md.
`;

export function main(argv: string[]): number {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  if (command === "verify") {
    const receiptId = rest[0];
    if (!receiptId) {
      process.stderr.write("Usage: marked verify <receipt_id>\n");
      return 1;
    }
    try {
      verifyReceipt(receiptId);
      return 0;
    } catch (err) {
      if (err instanceof VerifyNotImplementedError) {
        process.stdout.write(`${err.message}\n`);
        return 1;
      }
      throw err;
    }
  }

  process.stderr.write(`Unknown command: ${command}\n\n${HELP_TEXT}`);
  return 1;
}

const isDirectRun = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  process.exitCode = main(process.argv.slice(2));
}
