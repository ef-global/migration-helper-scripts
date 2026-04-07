#!/usr/bin/env bun
import { runMigrationAuditCli } from "./scripts/migration-audit-cli.js";
import { VERSION } from "./version.js";

const HELP_TEXT = `migration-helper

USAGE:
  migration-helper
  migration-helper audit [file-or-dir] [--json] [--debug] [--only id[,id...]] [--validators-root <path>]
  migration-helper diff [before.json after.json] [--out <html-file>] [--serve] [--port 4173]
  migration-helper version

COMMANDS:
  audit   Run migration audit (interactive when no target path is provided)
  diff    Generate visual HTML diff (interactive when no file paths are provided)
  version Show CLI version
  help    Show this help message

EXAMPLES:
  migration-helper
  migration-helper audit
  migration-helper diff before.json after.json --serve --port 4717
`;

function printHelp(): void {
  console.log(HELP_TEXT);
}

function printVersion(): void {
  console.log(`migration-helper v${VERSION}`);
}

export async function runCli(args: string[] = process.argv.slice(2)): Promise<number> {
  const command = args[0];

  if (!command || command === "audit" || command === "diff") {
    return runMigrationAuditCli(args);
  }

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    printVersion();
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
