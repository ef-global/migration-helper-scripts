import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Validator = {
  id: string;
  name: string;
  script: string;
};

const validators: Validator[] = [
  {
    id: "suffixes",
    name: "Component suffixes (-section/-flex-group)",
    script: "src/scripts/validate-component-suffixes.ts",
  },
  {
    id: "v3-to-v4",
    name: "V3-to-V4 field migration",
    script: "src/scripts/validate-v3-to-v4.ts",
  },
  {
    id: "field-removal-risk",
    name: "V3-to-V4 field-removal safety",
    script: "src/scripts/validate-field-removal-risk.ts",
  },
  {
    id: "non-v3-to-v4",
    name: "Other migrations (carousel/hide/visibility/items/transitions)",
    script: "src/scripts/validate-non-v3-to-v4.ts",
  },
];

const thisFilePath = fileURLToPath(import.meta.url);
const thisDirPath = dirname(thisFilePath);
const projectRootPath = resolve(thisDirPath, "../..");

function getValidatorScriptPath(validator: Validator): string {
  return resolve(projectRootPath, validator.script);
}

function debugLog(isDebug: boolean, message: string): void {
  if (isDebug) {
    console.error(`[debug] ${message}`);
  }
}

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

const ignoredDirs = new Set(["node_modules", ".git", "dist", "coverage"]);

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

function runValidatorJson(
  filePath: string,
  validator: Validator,
  isDebug: boolean,
): ValidatorOutput {
  const validatorScriptPath = getValidatorScriptPath(validator);
  const commandArgs = ["run", validatorScriptPath, filePath, "--json"];

  if (isDebug) {
    commandArgs.push("--debug");
  }

  debugLog(isDebug, `checking ${validator.id} on ${filePath}`);

  const result = spawnSync("bun", commandArgs, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });

  if (isDebug && result.stderr) {
    process.stderr.write(
      result.stderr.endsWith("\n") ? result.stderr : result.stderr + "\n",
    );
  }

  if (result.error) {
    debugLog(isDebug, `validator ${validator.id} errored on ${filePath}`);
    return {
      name: validator.name,
      ok: false,
      issueCount: 0,
      issues: [],
      error: result.error.message,
    };
  }

  if (result.status !== 0) {
    debugLog(isDebug, `validator ${validator.id} failed on ${filePath}`);
    return {
      name: validator.name,
      ok: false,
      issueCount: 0,
      issues: [],
      error: (result.stderr || "").trim() || "Validator exited with error.",
    };
  }

  const output = (result.stdout || "").trim();
  if (!output) {
    debugLog(isDebug, `validator ${validator.id} returned no output on ${filePath}`);
    return {
      name: validator.name,
      ok: false,
      issueCount: 0,
      issues: [],
      error: "Validator returned no JSON output.",
    };
  }

  try {
    const parsed = JSON.parse(output) as {
      ok?: boolean;
      issueCount?: number;
      issues?: unknown[];
    };

    const issueCount = Number(parsed.issueCount ?? 0);
    if (issueCount > 0) {
      debugLog(
        isDebug,
        `found problem in ${validator.id} on ${filePath}: ${issueCount} issue(s)`,
      );
    } else {
      debugLog(isDebug, `successfully checked ${validator.id} on ${filePath}`);
    }

    return {
      name: validator.name,
      ok: Boolean(parsed.ok),
      issueCount,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch (err) {
    debugLog(isDebug, `validator ${validator.id} returned invalid JSON on ${filePath}`);
    return {
      name: validator.name,
      ok: false,
      issueCount: 0,
      issues: [],
      error:
        err instanceof Error ? err.message : "Failed to parse validator JSON.",
    };
  }
}

function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes("--json");
  const isDebug = args.includes("--debug");
  const onlyIds: string[] = [];
  let targetPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json" || arg === "--debug") continue;

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
        console.error("Missing value for --only.");
        process.exit(1);
      }
      onlyIds.push(...value.split(",").map((id) => id.trim()).filter(Boolean));
      i += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    }

    if (!targetPath) {
      targetPath = arg;
    } else {
      console.error("Only one file or directory path is allowed.");
      process.exit(1);
    }
  }

  if (!targetPath) {
    console.error(
      "Usage: bun run src/scripts/migration-audit.ts <file-or-dir> [--json] [--debug] [--only id[,id...]]",
    );
    console.error(
      "Example: bun run src/scripts/migration-audit.ts ./migration-previews --debug",
    );
    console.error(
      "Available validator ids: suffixes, v3-to-v4, field-removal-risk, non-v3-to-v4",
    );
    process.exit(1);
  }

  const allowedIds = new Set(validators.map((validator) => validator.id));
  const uniqueOnlyIds = Array.from(new Set(onlyIds));
  for (const id of uniqueOnlyIds) {
    if (!allowedIds.has(id)) {
      console.error(`Unknown validator id: ${id}`);
      console.error(
        "Available validator ids: suffixes, v3-to-v4, field-removal-risk, non-v3-to-v4",
      );
      process.exit(1);
    }
  }

  const selectedValidators =
    uniqueOnlyIds.length > 0
      ? validators.filter((validator) => uniqueOnlyIds.includes(validator.id))
      : validators;

  const files = collectJsonFiles(targetPath).sort();
  if (files.length === 0) {
    console.error("No JSON files found at the provided path.");
    process.exit(1);
  }

  let hadErrors = false;

  if (isJson) {
    const report: AuditReport = {
      ok: true,
      issueCount: 0,
      files: [],
    };

    for (const filePath of files) {
      debugLog(isDebug, `checking file ${filePath}`);

      const fileReport: FileReport = {
        file: filePath,
        ok: true,
        issueCount: 0,
        validators: [],
      };

      for (const validator of selectedValidators) {
        const result = runValidatorJson(filePath, validator, isDebug);
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
          isDebug,
          `found problem in ${filePath}: ${fileReport.issueCount} issue(s) total`,
        );
      } else {
        debugLog(isDebug, `successfully checked ${filePath}`);
      }
    }

    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const filePath of files) {
      if (files.length > 1) {
        console.log(`\n===== File: ${filePath} =====`);
      }

      debugLog(isDebug, `checking file ${filePath}`);

      for (const validator of selectedValidators) {
        console.log(`\n=== ${validator.name} ===\n`);
        const validatorScriptPath = getValidatorScriptPath(validator);
        const commandArgs = ["run", validatorScriptPath, filePath];

        if (isDebug) {
          commandArgs.push("--debug");
        }

        debugLog(isDebug, `checking ${validator.id} on ${filePath}`);

        const result = spawnSync("bun", commandArgs, {
          stdio: "inherit",
        });

        if (result.status !== 0) {
          hadErrors = true;
          debugLog(isDebug, `validator ${validator.id} failed on ${filePath}`);
        } else {
          debugLog(isDebug, `completed ${validator.id} on ${filePath}`);
        }
      }
    }
  }

  if (hadErrors) {
    process.exit(1);
  }
}

main();
