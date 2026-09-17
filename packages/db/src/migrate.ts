#!/usr/bin/env node
/**
 * Gate 11 §8 — explicit, repeatable, deterministic migration runner.
 *
 * Applies every `.sql` file under `packages/db/migrations/`, in filename
 * order, that has not already been recorded in `schema_migrations`. Each
 * migration runs inside its own transaction; a failed migration rolls back
 * and stops the run (later migrations are not attempted). Safe to re-run —
 * already-applied migrations are skipped, not reapplied.
 *
 * This script NEVER drops a table, never truncates data, and never runs
 * automatically as a side effect of starting the app or building it — it
 * only runs when explicitly invoked via `pnpm db:migrate`.
 *
 * Usage: DATABASE_URL=postgresql://... pnpm db:migrate
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

async function main() {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Nothing to migrate against — refusing to guess a connection.");
    process.exitCode = 1;
    return;
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // filenames are zero-padded (0001_, 0002_, ...) so lexicographic sort is deterministic order

  if (files.length === 0) {
    console.log("No migration files found under packages/db/migrations/.");
    return;
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    const appliedRows = await sql<{ filename: string }[]>`SELECT filename FROM schema_migrations`;
    const applied = new Set(appliedRows.map((r) => r.filename));

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[skip] ${file} (already applied)`);
        continue;
      }
      const script = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`[apply] ${file}`);
      await sql.begin(async (tx) => {
        await tx.unsafe(script);
        await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
      });
      appliedCount += 1;
    }

    console.log(`Done. ${appliedCount} migration(s) applied, ${files.length - appliedCount} already up to date.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
