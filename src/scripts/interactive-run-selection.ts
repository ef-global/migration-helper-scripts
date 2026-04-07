import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import inquirer from "inquirer";
import {
  discoverMigrationValidators,
  findDefaultValidatorsRoot,
  type DiscoveredMigrationValidator,
} from "./discover-migration-validators.js";
import {
  discoverMigrationRuns,
  findDefaultRunsRoot,
  selectBestAuditArtifactPath,
  type DiscoveredMigrationRun,
} from "./discover-migration-runs.js";
import { runMigrationAudit } from "./migration-audit.js";
import { runMigrationDiff } from "./migration-diff.js";

type InteractiveMode = "audit" | "diff";
type FlowResult = "change-root" | "back" | "exit" | number;

type InteractiveControllerOptions = {
  initialMode?: InteractiveMode;
  initialRunsRoot?: string;
  auditDefaults?: {
    useJson?: boolean;
    debug?: boolean;
    onlyIds?: string[];
    validatorsRoot?: string;
  };
  diffDefaults?: {
    outPath?: string;
    serve?: boolean;
    port?: number;
  };
};

type RunSelectionAction = DiscoveredMigrationRun | "change-root" | "back" | "exit";

function sanitizeForFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function buildRunLabel(run: DiscoveredMigrationRun): string {
  const parts = [run.artifactBaseName, run.itemType];

  if (run.timestamp) {
    parts.push(run.timestamp);
  } else {
    parts.push("no timestamp");
  }

  if (
    typeof run.summary.totalChangedItems === "number" &&
    typeof run.summary.totalItems === "number"
  ) {
    parts.push(`changed ${run.summary.totalChangedItems}/${run.summary.totalItems}`);
  }

  if (typeof run.summary.stepCount === "number") {
    parts.push(`${run.summary.stepCount} steps`);
  }

  if (
    typeof run.summary.validationIssueCount === "number" &&
    run.summary.validationIssueCount > 0
  ) {
    parts.push(`${run.summary.validationIssueCount} validation issues`);
  }

  if (run.isComplete) {
    parts.push("complete");
  } else {
    const missing: string[] = [];
    if (!run.files.inputFull) missing.push("input-full");
    if (!run.files.afterFull) missing.push("after-full");
    if (!run.files.toMigrate) missing.push("to-migrate");
    if (!run.files.pipelineSummary) missing.push("pipeline-summary");

    if (missing.length > 0) {
      parts.push(`incomplete`);
      parts.push(`missing ${missing.join(", ")}`);
    } else {
      parts.push("incomplete");
    }
  }

  return parts.join(" · ");
}

async function loadValidatorsWithFallback(
  preferredRoot?: string,
): Promise<{
  validatorsRoot: string;
  validators: DiscoveredMigrationValidator[];
}> {
  try {
    return await discoverMigrationValidators({
      validatorsRoot: preferredRoot,
    });
  } catch {
    const suggestedRoot =
      preferredRoot ||
      findDefaultValidatorsRoot() ||
      "../gc/backpack/src/storyblok/migrations";

    const { validatorsRoot } = await inquirer.prompt<{ validatorsRoot: string }>([
      {
        type: "input",
        name: "validatorsRoot",
        message: "Enter Backpack validators root directory:",
        default: suggestedRoot,
        validate: (inputValue: string) =>
          inputValue.trim().length > 0 || "Please enter a path.",
      },
    ]);

    return discoverMigrationValidators({ validatorsRoot });
  }
}

export async function promptForRunsRoot(
  initialRoot?: string | null,
): Promise<string | null> {
  const suggestedRoot = initialRoot ?? findDefaultRunsRoot() ?? "./sbmig/migrations";

  while (true) {
    const { runsRoot } = await inquirer.prompt<{ runsRoot: string }>([
      {
        type: "input",
        name: "runsRoot",
        message: "Enter migrations directory:",
        default: suggestedRoot,
        validate: (inputValue: string) => {
          const trimmed = inputValue.trim();
          if (trimmed.length === 0) {
            return "Please enter a path.";
          }

          const resolved = resolve(trimmed);

          if (!existsSync(resolved)) {
            return "Path does not exist.";
          }

          try {
            if (!statSync(resolved).isDirectory()) {
              return "Path must be a directory.";
            }
          } catch {
            return "Path could not be read.";
          }

          return true;
        },
      },
    ]);

    if (runsRoot.trim().length === 0) {
      continue;
    }

    return resolve(runsRoot);
  }
}

async function promptForMode(
  runsRoot: string,
): Promise<InteractiveMode | "change-root" | "exit"> {
  const { mode } = await inquirer.prompt<{
    mode: InteractiveMode | "change-root" | "exit";
  }>([
    {
      type: "list",
      name: "mode",
      message: `What do you want to do? (${runsRoot})`,
      choices: [
        { name: "Audit migration run", value: "audit" },
        { name: "Diff migration run", value: "diff" },
        { name: "Change migrations directory", value: "change-root" },
        { name: "Exit", value: "exit" },
      ],
      default: 0,
    },
  ]);

  return mode;
}

export async function promptForRunSelection(
  runs: DiscoveredMigrationRun[],
  mode: InteractiveMode,
): Promise<RunSelectionAction> {
  const relevantRuns = runs.filter((run) =>
    mode === "diff" ? run.completeness.diffReady : run.completeness.auditReady,
  );

  if (relevantRuns.length === 0) {
    return "back";
  }

  const { selection } = await inquirer.prompt<{ selection: RunSelectionAction }>([
    {
      type: "list",
      name: "selection",
      message:
        mode === "diff"
          ? "Select a migration run to diff:"
          : "Select a migration run to audit:",
      choices: [
        ...runs.map((run) => ({
          name: buildRunLabel(run),
          value: run as RunSelectionAction,
          disabled:
            mode === "diff"
              ? run.completeness.diffReady
                ? false
                : "missing input-full or after-full"
              : run.completeness.auditReady
                ? false
                : "no auditable artifact",
        })),
        new inquirer.Separator(),
        { name: "Change migrations directory", value: "change-root" as const },
        { name: "Back", value: "back" as const },
        { name: "Exit", value: "exit" as const },
      ],
      default: 0,
      pageSize: 15,
    },
  ]);

  return selection;
}

async function runInteractiveDiffFlow(
  runs: DiscoveredMigrationRun[],
  defaults?: InteractiveControllerOptions["diffDefaults"],
): Promise<FlowResult> {
  const selection = await promptForRunSelection(runs, "diff");

  if (typeof selection === "string") {
    return selection;
  }

  const beforePath = selection.files.inputFull;
  const afterPath = selection.files.afterFull;

  if (!beforePath || !afterPath) {
    console.log("Selected run is incomplete for diff. Choose another run.");
    return "back";
  }

  const defaultOutPath =
    defaults?.outPath ||
    `./migration-diff-report--${sanitizeForFileName(selection.id)}.html`;

  const { serve } = await inquirer.prompt<{ serve: boolean }>([
    {
      type: "confirm",
      name: "serve",
      message: "Serve diff locally?",
      default: defaults?.serve ?? false,
    },
  ]);

  const port = serve
    ? (
        await inquirer.prompt<{ port: number }>([
          {
            type: "number",
            name: "port",
            message: "Port:",
            default: defaults?.port ?? 4173,
            validate: (inputValue: number) =>
              Number.isFinite(inputValue) && inputValue > 0
                ? true
                : "Please enter a positive number.",
          },
        ])
      ).port
    : undefined;

  const { outPath } = await inquirer.prompt<{ outPath: string }>([
    {
      type: "input",
      name: "outPath",
      message: "Output HTML file path:",
      default: defaultOutPath,
      validate: (inputValue: string) =>
        inputValue.trim().length > 0 || "Please enter a path.",
    },
  ]);

  const diffArgs = [beforePath, afterPath, "--out", outPath];

  if (serve) {
    diffArgs.push("--serve", "--port", String(port ?? defaults?.port ?? 4173));
  }

  return runMigrationDiff(diffArgs, "migration-helper diff");
}

async function runInteractiveAuditFlow(
  runs: DiscoveredMigrationRun[],
  defaults?: InteractiveControllerOptions["auditDefaults"],
): Promise<FlowResult> {
  const selection = await promptForRunSelection(runs, "audit");

  if (typeof selection === "string") {
    return selection;
  }

  const discovered = await loadValidatorsWithFallback(defaults?.validatorsRoot);

  const validatorChoices = [
    {
      name: "Full audit (all validators)",
      value: [] as string[],
    },
    ...discovered.validators.map((validator) => ({
      name: validator.name,
      value: [validator.id],
    })),
  ];

  const preferredAuditArtifact = selectBestAuditArtifactPath(selection);
  const artifactChoices = [
    selection.files.toMigrate
      ? {
          name: "Recommended: to-migrate",
          value: selection.files.toMigrate,
        }
      : null,
    selection.files.afterFull
      ? {
          name: "after-full",
          value: selection.files.afterFull,
        }
      : null,
    selection.files.validationFailed
      ? {
          name: "validation-failed",
          value: selection.files.validationFailed,
        }
      : null,
  ].filter((choice): choice is { name: string; value: string } => Boolean(choice));

  if (!preferredAuditArtifact || artifactChoices.length === 0) {
    console.log("Selected run has no auditable artifact. Choose another run.");
    return "back";
  }

  const { selectedValidatorIds, auditArtifact, useJson, debug } =
    await inquirer.prompt<{
      selectedValidatorIds: string[];
      auditArtifact: string;
      useJson: boolean;
      debug: boolean;
    }>([
      {
        type: "list",
        name: "selectedValidatorIds",
        message: "Select validation scope:",
        choices: validatorChoices,
        default:
          defaults?.onlyIds && defaults.onlyIds.length > 0
            ? validatorChoices.findIndex((choice) =>
                choice.value.join(",") === defaults.onlyIds?.join(","),
              )
            : 0,
      },
      {
        type: "list",
        name: "auditArtifact",
        message: "Audit artifact:",
        choices: artifactChoices,
        default: artifactChoices.findIndex(
          (choice) => choice.value === preferredAuditArtifact,
        ),
      },
      {
        type: "confirm",
        name: "useJson",
        message: "Output JSON?",
        default: defaults?.useJson ?? false,
      },
      {
        type: "confirm",
        name: "debug",
        message: "Enable debug logs?",
        default: defaults?.debug ?? false,
      },
    ]);

  const auditArgs = [
    auditArtifact,
    "--validators-root",
    discovered.validatorsRoot,
  ];

  if (selectedValidatorIds.length > 0) {
    auditArgs.push("--only", selectedValidatorIds.join(","));
  }

  if (useJson) {
    auditArgs.push("--json");
  }

  if (debug) {
    auditArgs.push("--debug");
  }

  return runMigrationAudit(auditArgs);
}

export async function runInteractiveMigrationHelper({
  initialMode,
  initialRunsRoot,
  auditDefaults,
  diffDefaults,
}: InteractiveControllerOptions = {}): Promise<number> {
  let runsRoot = initialRunsRoot ?? findDefaultRunsRoot();
  let forcedMode = initialMode ?? null;

  while (true) {
    if (!runsRoot) {
      runsRoot = await promptForRunsRoot();
    }

    if (!runsRoot) {
      return 0;
    }

    const runs = await discoverMigrationRuns({ root: runsRoot });

    if (runs.length === 0) {
      console.log(`No sb-mig runs found in ${runsRoot}.`);

      const { action } = await inquirer.prompt<{
        action: "change-root" | "exit";
      }>([
        {
          type: "list",
          name: "action",
          message: "No migration runs discovered.",
          choices: [
            { name: "Change migrations directory", value: "change-root" },
            { name: "Exit", value: "exit" },
          ],
          default: 0,
        },
      ]);

      if (action === "exit") {
        return 0;
      }

      runsRoot = await promptForRunsRoot(runsRoot);
      forcedMode = null;
      continue;
    }

    const mode =
      forcedMode ?? (await promptForMode(runsRoot));
    forcedMode = null;

    if (mode === "exit") {
      return 0;
    }

    if (mode === "change-root") {
      runsRoot = await promptForRunsRoot(runsRoot);
      continue;
    }

    const result =
      mode === "diff"
        ? await runInteractiveDiffFlow(runs, diffDefaults)
        : await runInteractiveAuditFlow(runs, auditDefaults);

    if (result === "change-root") {
      runsRoot = await promptForRunsRoot(runsRoot);
      continue;
    }

    if (result === "back") {
      continue;
    }

    if (result === "exit") {
      return 0;
    }

    return result;
  }
}
