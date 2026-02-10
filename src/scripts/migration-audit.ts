import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  discoverMigrationValidators,
  isMigrationValidationReport,
  type DiscoveredMigrationValidator,
} from "./discover-migration-validators.js";
import { validateRuleSet } from "./validate-rule-set.js";

type ValidatorOutput = {
  name: string;
  ok: boolean;
  issueCount: number;
  issues: unknown[];
  error?: string;
};

type FileReport = {
  file: string;
  ok: boolean;
  issueCount: number;
  validators: ValidatorOutput[];
};

type AuditReport = {
  ok: boolean;
  issueCount: number;
  files: FileReport[];
};

type ParsedArgs = {
  targetPath: string | null;
  isJson: boolean;
  isDebug: boolean;
  onlyIds: string[];
  validatorsRoot?: string;
  unknownFlags: string[];
};

const ignoredDirs = new Set(["node_modules", ".git", "dist", "coverage"]);

function debugLog(isDebug: boolean, message: string): void {
  if (isDebug) {
    console.error(`[debug] ${message}`);
  }
}

function collectJsonFiles(targetPath: string): string[] {
  const stats = statSync(targetPath);

  if (stats.isFile()) {
    return [targetPath];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  const results: string[] = [];
  const entries = readdirSync(targetPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      results.push(...collectJsonFiles(join(targetPath, entry.name)));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      results.push(join(targetPath, entry.name));
    }
  }

  return results;
}

function parseCliArgs(args: string[]): ParsedArgs {
  const unknownFlags: string[] = [];
  const isJson = args.includes("--json");
  const isDebug = args.includes("--debug");
  const onlyIds: string[] = [];

  let targetPath: string | null = null;
  let validatorsRoot: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--json" || arg === "--debug") {
      continue;
    }

    if (arg.startsWith("--only=")) {
      const value = arg.slice("--only=".length);
      if (value) {
        onlyIds.push(...value.split(",").map((id) => id.trim()).filter(Boolean));
      }
      continue;
    }

    if (arg === "--only") {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --only.");
      }
      onlyIds.push(...value.split(",").map((id) => id.trim()).filter(Boolean));
      i += 1;
      continue;
    }

    if (arg.startsWith("--validators-root=")) {
      validatorsRoot = arg.slice("--validators-root=".length);
      continue;
    }

    if (arg.startsWith("--validatorsRoot=")) {
      validatorsRoot = arg.slice("--validatorsRoot=".length);
      continue;
    }

    if (arg === "--validators-root" || arg === "--validatorsRoot") {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --validators-root.");
      }
      validatorsRoot = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      unknownFlags.push(arg);
      continue;
    }

    if (targetPath === null) {
      targetPath = arg;
    } else {
      throw new Error("Only one file or directory path is allowed.");
    }
  }

  return {
    targetPath,
    isJson,
    isDebug,
    onlyIds,
    validatorsRoot,
    unknownFlags,
  };
}

function printUsage(): void {
  console.error(
    "Usage: bun run src/scripts/migration-audit.ts <file-or-dir> [--json] [--debug] [--only id[,id...]] [--validators-root <path>]",
  );
  console.error(
    "Example: bun run src/scripts/migration-audit.ts ./migration-previews --debug",
  );
}

async function runValidatorJson(
  filePath: string,
  validator: DiscoveredMigrationValidator,
  isDebug: boolean,
): Promise<ValidatorOutput> {
  debugLog(isDebug, `checking ${validator.id} on ${filePath}`);

  try {
    let report;

    if (validator.validateFile) {
      report = await validator.validateFile({ filePath, isDebug });
    } else if (validator.ruleSet) {
      report = await validateRuleSet(filePath, validator.ruleSet, {
        isDebug,
      });
    } else if (validator.validateData) {
      const fileData = await Bun.file(filePath).json();
      report = await validator.validateData({ data: fileData, isDebug });
    } else {
      throw new Error(
        `Validator '${validator.id}' has neither ruleSet nor custom validate function.`,
      );
    }

    if (!isMigrationValidationReport(report)) {
      throw new Error(
        `Validator '${validator.id}' returned invalid report shape. Expected { ok, issueCount, issues[] }`,
      );
    }

    if (report.issueCount > 0) {
      debugLog(
        isDebug,
        `found problem in ${validator.id} on ${filePath}: ${report.issueCount} issue(s)`,
      );
    } else {
      debugLog(isDebug, `successfully checked ${validator.id} on ${filePath}`);
    }

    return {
      name: validator.name,
      ok: report.ok,
      issueCount: report.issueCount,
      issues: report.issues,
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Validator failed unexpectedly.";

    debugLog(isDebug, `validator ${validator.id} errored on ${filePath}`);

    return {
      name: validator.name,
      ok: false,
      issueCount: 0,
      issues: [],
      error: errorMessage,
    };
  }
}

function printHumanValidatorReport(
  validator: DiscoveredMigrationValidator,
  result: ValidatorOutput,
): void {
  if (result.error) {
    console.error(`Error: ${result.error}`);
    return;
  }

  if (result.issueCount === 0) {
    const noIssuesMessage =
      validator.ruleSet?.noIssuesMessage ??
      `No ${validator.name} issues found.`;

    console.log(noIssuesMessage);
    return;
  }

  console.log(`Found ${result.issueCount} potential migration issue(s):\n`);
  for (const issue of result.issues as Array<{
    componentPath: string;
    component: string;
    uid: string | null;
    message: string;
  }>) {
    const uidStr = issue.uid ? ` (_uid: ${issue.uid})` : "";
    console.log(
      `  ${issue.componentPath} -> ${issue.component}${uidStr}  ${issue.message}`,
    );
  }
}

async function main(): Promise<void> {
  let parsed: ParsedArgs;

  try {
    parsed = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    printUsage();
    process.exit(1);
    return;
  }

  if (parsed.unknownFlags.length > 0) {
    for (const flag of parsed.unknownFlags) {
      console.error(`Unknown flag: ${flag}`);
    }
    printUsage();
    process.exit(1);
  }

  if (!parsed.targetPath) {
    printUsage();
    process.exit(1);
  }

  const files = collectJsonFiles(parsed.targetPath).sort();
  if (files.length === 0) {
    console.error("No JSON files found at the provided path.");
    process.exit(1);
  }

  const discovered = await discoverMigrationValidators({
    validatorsRoot: parsed.validatorsRoot,
    isDebug: parsed.isDebug,
  });

  const allowedIds = new Set(discovered.validators.map((validator) => validator.id));
  const uniqueOnlyIds = Array.from(new Set(parsed.onlyIds));

  for (const id of uniqueOnlyIds) {
    if (!allowedIds.has(id)) {
      console.error(`Unknown validator id: ${id}`);
      console.error(
        `Available validator ids: ${discovered.validators.map((v) => v.id).join(", ")}`,
      );
      process.exit(1);
    }
  }

  const selectedValidators =
    uniqueOnlyIds.length > 0
      ? discovered.validators.filter((validator) => uniqueOnlyIds.includes(validator.id))
      : discovered.validators;

  debugLog(
    parsed.isDebug,
    `using ${selectedValidators.length} validator(s) from ${discovered.validatorsRoot}`,
  );

  let hadErrors = false;

  if (parsed.isJson) {
    const report: AuditReport = {
      ok: true,
      issueCount: 0,
      files: [],
    };

    for (const filePath of files) {
      debugLog(parsed.isDebug, `checking file ${filePath}`);

      const fileReport: FileReport = {
        file: filePath,
        ok: true,
        issueCount: 0,
        validators: [],
      };

      for (const validator of selectedValidators) {
        const result = await runValidatorJson(filePath, validator, parsed.isDebug);
        fileReport.validators.push(result);
        fileReport.issueCount += result.issueCount;

        if (!result.ok) {
          fileReport.ok = false;
        }

        if (result.error) {
          hadErrors = true;
        }
      }

      if (fileReport.issueCount > 0) {
        fileReport.ok = false;
      }

      report.files.push(fileReport);
      report.issueCount += fileReport.issueCount;

      if (!fileReport.ok) {
        report.ok = false;
      }

      if (fileReport.issueCount > 0) {
        debugLog(
          parsed.isDebug,
          `found problem in ${filePath}: ${fileReport.issueCount} issue(s) total`,
        );
      } else {
        debugLog(parsed.isDebug, `successfully checked ${filePath}`);
      }
    }

    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const filePath of files) {
      if (files.length > 1) {
        console.log(`\n===== File: ${filePath} =====`);
      }

      debugLog(parsed.isDebug, `checking file ${filePath}`);

      for (const validator of selectedValidators) {
        console.log(`\n=== ${validator.name} ===\n`);

        const result = await runValidatorJson(filePath, validator, parsed.isDebug);

        if (result.error) {
          hadErrors = true;
          debugLog(
            parsed.isDebug,
            `validator ${validator.id} failed on ${filePath}: ${result.error}`,
          );
        } else {
          debugLog(
            parsed.isDebug,
            `completed ${validator.id} on ${filePath} with ${result.issueCount} issue(s)`,
          );
        }

        printHumanValidatorReport(validator, result);
      }
    }
  }

  if (hadErrors) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
