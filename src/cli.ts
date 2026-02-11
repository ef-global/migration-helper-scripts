#!/usr/bin/env bun
import { runMigrationAuditCli } from "./scripts/migration-audit-cli.js";
import { runMigrationDiff } from "./scripts/migration-diff.js";

const HELP_TEXT = `migration-helper

USAGE:
  migration-helper [audit]
  migration-helper diff <before.json> <after.json> [--out <html-file>] [--serve] [--port 4173]

COMMANDS:
  audit   Run interactive migration validator selection (default)
  diff    Generate visual HTML diff between two JSON files
  help    Show this help message

EXAMPLES:
  migration-helper
  migration-helper audit
  migration-helper diff before.json after.json --serve --port 4717
`;

function printHelp(): void {
  console.log(HELP_TEXT);
}

export async function runCli(args: string[] = process.argv.slice(2)): Promise<number> {
  const command = args[0];

  if (!command || command === "audit") {
    return runMigrationAuditCli(args.slice(command ? 1 : 0));
  }

  if (command === "diff") {
    return runMigrationDiff(args.slice(1), "migration-helper diff");
  }

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  return 1;
}

if (import.meta.main) {
  runCli()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
