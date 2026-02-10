import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  MigrationValidationDataFn,
  MigrationValidationFileFn,
  MigrationValidationReport,
  RuleSetConfig,
} from "./migration-validator-contract.js";

export type DiscoveredMigrationValidator = {
  id: string;
  name: string;
  ruleSet?: RuleSetConfig;
  validateData?: MigrationValidationDataFn;
  validateFile?: MigrationValidationFileFn;
  filePath: string;
};

const validationFileRegex = /\.validation\.(ts|js|mjs|cjs)$/i;

const ignoredDirs = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".next",
  ".turbo",
]);

function debugLog(isDebug: boolean, message: string): void {
  if (isDebug) {
    console.error(`[debug] ${message}`);
  }
}

function collectValidationFiles(targetDir: string): string[] {
  if (!existsSync(targetDir)) {
    return [];
  }

  const entries = readdirSync(targetDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const entryPath = resolve(targetDir, entry.name);

    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      results.push(...collectValidationFiles(entryPath));
      continue;
    }

    if (entry.isFile() && validationFileRegex.test(entry.name)) {
      results.push(entryPath);
    }
  }

  return results;
}

function isRuleSetConfig(value: unknown): value is RuleSetConfig {
  if (!value || typeof value !== "object") return false;

  const maybe = value as {
    ruleSetName?: unknown;
    rules?: unknown;
    noIssuesMessage?: unknown;
  };

  return (
    typeof maybe.ruleSetName === "string" &&
    Boolean(maybe.rules) &&
    typeof maybe.rules === "object" &&
    typeof maybe.noIssuesMessage === "string"
  );
}

function getCandidateScore(filePath: string): number {
  if (filePath.endsWith(".validation.ts")) return 4;
  if (filePath.endsWith(".validation.mjs")) return 3;
  if (filePath.endsWith(".validation.js")) return 2;
  if (filePath.endsWith(".validation.cjs")) return 1;
  return 0;
}

export function isMigrationValidationReport(
  value: unknown,
): value is MigrationValidationReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybe = value as {
    ok?: unknown;
    issueCount?: unknown;
    issues?: unknown;
  };

  return (
    typeof maybe.ok === "boolean" &&
    typeof maybe.issueCount === "number" &&
    Array.isArray(maybe.issues)
  );
}

async function loadValidatorFromFile(
  filePath: string,
): Promise<DiscoveredMigrationValidator | null> {
  const moduleUrl = pathToFileURL(filePath).href;
  const loaded = await import(moduleUrl);
  const candidate = loaded?.default ?? loaded;

  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const maybe = candidate as {
    id?: unknown;
    name?: unknown;
    ruleSet?: unknown;
    validateData?: unknown;
    validateFile?: unknown;
  };

  if (typeof maybe.id !== "string" || typeof maybe.name !== "string") {
    return null;
  }

  const ruleSet = isRuleSetConfig(maybe.ruleSet) ? maybe.ruleSet : undefined;
  const validateData =
    typeof maybe.validateData === "function"
      ? (maybe.validateData as MigrationValidationDataFn)
      : undefined;
  const validateFile =
    typeof maybe.validateFile === "function"
      ? (maybe.validateFile as MigrationValidationFileFn)
      : undefined;

  if (!ruleSet && !validateData && !validateFile) {
    return null;
  }

  return {
    id: maybe.id,
    name: maybe.name,
    ruleSet,
    validateData,
    validateFile,
    filePath,
  };
}

export function getDefaultValidatorsRootCandidates(): string[] {
  const candidates = [
    process.env.MIGRATION_VALIDATORS_ROOT,
    resolve(process.cwd(), "src/storyblok/migrations"),
    resolve(process.cwd(), "lib/storyblok/migrations"),
    resolve(
      process.cwd(),
      "node_modules/@ef-global/backpack/lib/storyblok/migrations",
    ),
    resolve(process.cwd(), "../gc/backpack/src/storyblok/migrations"),
    resolve(process.cwd(), "../gc/backpack/lib/storyblok/migrations"),
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(candidates));
}

export function findDefaultValidatorsRoot(): string | null {
  const candidates = getDefaultValidatorsRootCandidates();

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    if (collectValidationFiles(candidate).length === 0) continue;

    return candidate;
  }

  return null;
}

export async function discoverMigrationValidators({
  validatorsRoot,
  isDebug = false,
}: {
  validatorsRoot?: string;
  isDebug?: boolean;
} = {}): Promise<{
  validatorsRoot: string;
  validators: DiscoveredMigrationValidator[];
}> {
  const resolvedRoot =
    validatorsRoot && validatorsRoot.trim().length > 0
      ? resolve(validatorsRoot)
      : findDefaultValidatorsRoot();

  if (!resolvedRoot) {
    throw new Error(
      "Could not locate migration validators root. Pass --validators-root <path> or set MIGRATION_VALIDATORS_ROOT.",
    );
  }

  const files = collectValidationFiles(resolvedRoot).sort();

  if (files.length === 0) {
    throw new Error(
      `No *.validation.* files found under validators root: ${resolvedRoot}`,
    );
  }

  debugLog(isDebug, `using validators root: ${resolvedRoot}`);

  const byId = new Map<string, DiscoveredMigrationValidator>();

  for (const filePath of files) {
    try {
      const loaded = await loadValidatorFromFile(filePath);

      if (!loaded) {
        debugLog(
          isDebug,
          `skipping ${filePath} (missing default export with { id, name, ruleSet|validateData|validateFile })`,
        );
        continue;
      }

      const existing = byId.get(loaded.id);
      if (!existing) {
        byId.set(loaded.id, loaded);
        debugLog(isDebug, `discovered validator ${loaded.id} from ${filePath}`);
        continue;
      }

      const existingScore = getCandidateScore(existing.filePath);
      const loadedScore = getCandidateScore(loaded.filePath);

      if (loadedScore >= existingScore) {
        byId.set(loaded.id, loaded);
        debugLog(
          isDebug,
          `deduped validator ${loaded.id}: kept ${loaded.filePath}, replaced ${existing.filePath}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      debugLog(isDebug, `failed importing ${filePath}: ${message}`);
    }
  }

  const validators = Array.from(byId.values()).sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  if (validators.length === 0) {
    throw new Error(
      `No valid validator modules found under ${resolvedRoot}. Expected default export with { id, name, ruleSet|validateData|validateFile }`,
    );
  }

  return {
    validatorsRoot: resolvedRoot,
    validators,
  };
}
