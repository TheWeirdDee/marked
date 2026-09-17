// Gate 5 — compiles the controlled-testnet Governor Bravo stack using solc-js
// (standard JSON input/output). Not part of the shipped product; a one-time
// build step for evidence/lifecycle-fulfillment/contracts-src/*.sol.
import solc from "solc";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, "..", "evidence", "lifecycle-fulfillment", "contracts-src");
const OUT_FILE = join(SRC_DIR, "compiled.json");

const sourceFiles = readdirSync(SRC_DIR).filter((f) => f.endsWith(".sol") && !f.endsWith(".original.sol"));

const sources: Record<string, { content: string }> = {};
for (const file of sourceFiles) {
  sources[file] = { content: readFileSync(join(SRC_DIR, file), "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};

function findImports(path: string): { contents: string } | { error: string } {
  try {
    return { contents: readFileSync(join(SRC_DIR, path), "utf8") };
  } catch {
    return { error: "File not found: " + path };
  }
}

type SolcOutput = {
  errors?: { severity: string; formattedMessage: string }[];
  contracts: Record<string, Record<string, { abi: unknown; evm: { bytecode: { object: string }; deployedBytecode: { object: string } } }>>;
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports })) as SolcOutput;

let hasError = false;
if (output.errors) {
  for (const err of output.errors) {
    console.log(err.severity.toUpperCase() + ":", err.formattedMessage);
    if (err.severity === "error") hasError = true;
  }
}

if (hasError) {
  console.error("\nCompilation FAILED.");
  process.exit(1);
}

const result: Record<string, { abi: unknown; bytecode: string; deployedBytecodeSize: number }> = {};
for (const file of Object.keys(output.contracts)) {
  for (const contractName of Object.keys(output.contracts[file]!)) {
    const c = output.contracts[file]![contractName]!;
    result[contractName] = {
      abi: c.abi,
      bytecode: "0x" + c.evm.bytecode.object,
      deployedBytecodeSize: c.evm.deployedBytecode.object.length / 2,
    };
  }
}

writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), "utf8");
console.log("\nCompilation OK. Contracts:", Object.keys(result).join(", "));
for (const [name, c] of Object.entries(result)) {
  console.log(`  ${name}: bytecode ${c.bytecode.length / 2 - 1} bytes, deployed ${c.deployedBytecodeSize} bytes`);
}
console.log("\nWrote", OUT_FILE);
