#!/usr/bin/env bun
import { VERSION } from "../version.js";
import { parseMigrationAuditArgs, runMigrationAudit } from "./migration-audit.js";
import { parseDiffArgs, runMigrationDiff } from "./migration-diff.js";
import { runInteractiveMigrationHelper } from "./interactive-run-selection.js";

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
`;

function printHelp(): void {
  console.log(HELP_TEXT);
}

function printVersion(): void {
  console.log(`migration-helper v${VERSION}`);
}

export async function runMigrationAuditCli(
  args: string[] = process.argv.slice(2),
): Promise<number> {
  if (args.length > 0) {
    const command = args[0];

    if (command === "help" || command === "--help" || command === "-h") {
      printHelp();
      return 0;
    }

    if (command === "version" || command === "--version" || command === "-v") {
      printVersion();
      return 0;
    }

    if (command === "diff") {
      try {
        const parsed = parseDiffArgs(args.slice(1));

        if (!parsed.beforePath && !parsed.afterPath) {
          return runInteractiveMigrationHelper({
            initialMode: "diff",
            diffDefaults: {
              outPath: parsed.outPath,
              serve: parsed.serve,
              port: parsed.port,
            },
          });
        }
      } catch {
        return runMigrationDiff(args.slice(1), "migration-helper diff");
      }

      return runMigrationDiff(args.slice(1), "migration-helper diff");
    }

    if (command === "audit") {
      try {
        const parsed = parseMigrationAuditArgs(args.slice(1));

        if (!parsed.targetPath && parsed.unknownFlags.length === 0) {
          return runInteractiveMigrationHelper({
            initialMode: "audit",
            auditDefaults: {
              useJson: parsed.isJson,
              debug: parsed.isDebug,
              onlyIds: parsed.onlyIds,
              validatorsRoot: parsed.validatorsRoot,
            },
          });
        }
      } catch {
        return runMigrationAudit(args.slice(1));
      }

      return runMigrationAudit(args.slice(1));
    }

    return runMigrationAudit(args);
  }

  return runInteractiveMigrationHelper();
}

if (import.meta.main) {
  runMigrationAuditCli()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error("Error:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
