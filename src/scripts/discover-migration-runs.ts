import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export type MigrationArtifactKind =
  | "input-full"
  | "after-full"
  | "to-migrate"
  | "migration-pipeline-summary"
  | "validation-failed";

export type ParsedMigrationArtifact = {
  fileName: string;
  artifactBaseName: string;
  itemType: string;
  artifactKind: MigrationArtifactKind;
  timestamp: string | null;
  isDryRun: true;
};

export type DiscoveredMigrationRun = {
  id: string;
  artifactBaseName: string;
  itemType: string;
  timestamp: string | null;
  directory: string;
  artifactPrefix: string;
  isDryRun: true;
  files: {
    inputFull: string | null;
    afterFull: string | null;
    toMigrate: string | null;
    pipelineSummary: string | null;
    validationFailed: string | null;
  };
  completeness: {
    diffReady: boolean;
    auditReady: boolean;
  };
  isComplete: boolean;
  summary: {
    totalItems: number | null;
    totalChangedItems: number | null;
    stepCount: number | null;
    validationIssueCount: number | null;
  };
};

type PipelineSummaryShape = {
  totalItems?: unknown;
  totalChangedItems?: unknown;
  steps?: Array<{
    validation?: {
      issueCount?: unknown;
    } | null;
  }>;
};

const ignoredDirs = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".next",
  ".turbo",
]);

const artifactKinds: MigrationArtifactKind[] = [
  "input-full",
  "after-full",
  "to-migrate",
  "migration-pipeline-summary",
  "validation-failed",
];

const artifactFileRegex = new RegExp(
  `^dry-run--(?<artifactBaseName>.+?)---(?<itemType>.+?)-(?<artifactKind>${artifactKinds.join(
    "|",
  )})(?:__(?<timestamp>.+))?\\.json$`,
);

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
    const entryPath = join(targetPath, entry.name);

    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      results.push(...collectJsonFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      results.push(entryPath);
    }
  }

  return results;
}

export function parseMigrationArtifactFileName(
  fileName: string,
): ParsedMigrationArtifact | null {
  const match = artifactFileRegex.exec(fileName);

  if (!match?.groups) {
    return null;
  }

  const artifactKind = match.groups.artifactKind as MigrationArtifactKind;

  return {
    fileName,
    artifactBaseName: match.groups.artifactBaseName,
    itemType: match.groups.itemType,
    artifactKind,
    timestamp: match.groups.timestamp ?? null,
    isDryRun: true,
  };
}

export function getDefaultRunsRootCandidates(): string[] {
  const candidates = [
    process.env.MIGRATION_HELPER_RUNS_ROOT,
    resolve(process.cwd(), "sbmig/migrations"),
    resolve(process.cwd(), "migration-previews"),
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(candidates));
}

export function findDefaultRunsRoot(): string | null {
  for (const candidate of getDefaultRunsRootCandidates()) {
    if (!existsSync(candidate)) continue;

    try {
      if (statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function createRunId({
  artifactBaseName,
  itemType,
  timestamp,
}: {
  artifactBaseName: string;
  itemType: string;
  timestamp: string | null;
}): string {
  return `${itemType}::${artifactBaseName}::${timestamp ?? "no-ts"}`;
}

function choosePreferredPath(current: string | null, next: string): string {
  if (!current) {
    return next;
  }

  // Keep duplicate resolution deterministic without relying on fs metadata.
  return next.localeCompare(current) >= 0 ? next : current;
}

async function enrichRunWithSummary(
  run: DiscoveredMigrationRun,
  isDebug: boolean,
): Promise<void> {
  if (!run.files.pipelineSummary) {
    return;
  }

  try {
    const summary = (await Bun.file(run.files.pipelineSummary).json()) as
      | PipelineSummaryShape
      | null;

    if (!summary || typeof summary !== "object") {
      return;
    }

    run.summary.totalItems =
      typeof summary.totalItems === "number" ? summary.totalItems : null;
    run.summary.totalChangedItems =
      typeof summary.totalChangedItems === "number"
        ? summary.totalChangedItems
        : null;
    run.summary.stepCount = Array.isArray(summary.steps)
      ? summary.steps.length
      : null;
    run.summary.validationIssueCount = Array.isArray(summary.steps)
      ? summary.steps.reduce((sum, step) => {
          const issueCount = step?.validation?.issueCount;
          return sum + (typeof issueCount === "number" ? issueCount : 0);
        }, 0)
      : null;
  } catch (error) {
    debugLog(
      isDebug,
      `failed parsing pipeline summary for ${run.id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function selectBestAuditArtifactPath(
  run: DiscoveredMigrationRun,
): string | null {
  return (
    run.files.toMigrate ??
    run.files.afterFull ??
    run.files.validationFailed ??
    null
  );
}

export async function discoverMigrationRuns({
  root,
  isDebug = false,
}: {
  root: string;
  isDebug?: boolean;
}): Promise<DiscoveredMigrationRun[]> {
  const resolvedRoot = resolve(root);
  const files = collectJsonFiles(resolvedRoot).sort();
  const runsById = new Map<string, DiscoveredMigrationRun>();

  for (const filePath of files) {
    const fileName = filePath.split("/").pop();
    if (!fileName) continue;

    const parsed = parseMigrationArtifactFileName(fileName);
    if (!parsed) {
      continue;
    }

    const id = createRunId(parsed);
    const artifactPrefix = `dry-run--${parsed.artifactBaseName}---${parsed.itemType}`;
    const existing =
      runsById.get(id) ??
      ({
        id,
        artifactBaseName: parsed.artifactBaseName,
        itemType: parsed.itemType,
        timestamp: parsed.timestamp,
        directory: resolvedRoot,
        artifactPrefix,
        isDryRun: true,
        files: {
          inputFull: null,
          afterFull: null,
          toMigrate: null,
          pipelineSummary: null,
          validationFailed: null,
        },
        completeness: {
          diffReady: false,
          auditReady: false,
        },
        isComplete: false,
        summary: {
          totalItems: null,
          totalChangedItems: null,
          stepCount: null,
          validationIssueCount: null,
        },
      } satisfies DiscoveredMigrationRun);

    switch (parsed.artifactKind) {
      case "input-full":
        existing.files.inputFull = choosePreferredPath(
          existing.files.inputFull,
          filePath,
        );
        break;
      case "after-full":
        existing.files.afterFull = choosePreferredPath(
          existing.files.afterFull,
          filePath,
        );
        break;
      case "to-migrate":
        existing.files.toMigrate = choosePreferredPath(
          existing.files.toMigrate,
          filePath,
        );
        break;
      case "migration-pipeline-summary":
        existing.files.pipelineSummary = choosePreferredPath(
          existing.files.pipelineSummary,
          filePath,
        );
        break;
      case "validation-failed":
        existing.files.validationFailed = choosePreferredPath(
          existing.files.validationFailed,
          filePath,
        );
        break;
    }

    runsById.set(id, existing);
  }

  const runs = Array.from(runsById.values()).sort((a, b) => {
    if (a.artifactBaseName !== b.artifactBaseName) {
      return a.artifactBaseName.localeCompare(b.artifactBaseName);
    }

    if (a.itemType !== b.itemType) {
      return a.itemType.localeCompare(b.itemType);
    }

    return (a.timestamp ?? "").localeCompare(b.timestamp ?? "");
  });

  await Promise.all(
    runs.map(async (run) => {
      run.completeness.diffReady = Boolean(
        run.files.inputFull && run.files.afterFull,
      );
      run.completeness.auditReady = Boolean(selectBestAuditArtifactPath(run));
      run.isComplete =
        run.completeness.diffReady &&
        Boolean(run.files.toMigrate && run.files.pipelineSummary);

      await enrichRunWithSummary(run, isDebug);
    }),
  );

  return runs;
}
