#!/usr/bin/env bun
import inquirer from "inquirer";
import {
  discoverMigrationValidators,
  findDefaultValidatorsRoot,
  type DiscoveredMigrationValidator,
} from "./discover-migration-validators.js";
import { runMigrationAudit } from "./migration-audit.js";

type Option = {
  label: string;
  ids: string[];
};

async function loadValidatorsWithFallback(): Promise<{
  validatorsRoot: string;
  validators: DiscoveredMigrationValidator[];
}> {
  try {
    return await discoverMigrationValidators();
  } catch {
    const suggestedRoot =
      findDefaultValidatorsRoot() ?? "../gc/backpack/src/storyblok/migrations";

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

function createOptions(validators: DiscoveredMigrationValidator[]): Option[] {
  return [
    { label: "Full audit (all validators)", ids: [] },
    ...validators.map((validator) => ({
      label: validator.name,
      ids: [validator.id],
    })),
  ];
}

export async function runMigrationAuditCli(
  args: string[] = process.argv.slice(2),
): Promise<number> {
  if (args.length > 0) {
    return runMigrationAudit(args);
  }

  const discovered = await loadValidatorsWithFallback();
  const options = createOptions(discovered.validators);

  const { selection } = await inquirer.prompt<{ selection: Option }>([
    {
      type: "list",
      name: "selection",
      message: "Select a migration validation to run:",
      choices: options.map((option) => ({
        name: option.label,
        value: option,
      })),
      default: 0,
    },
  ]);

  const { targetPath } = await inquirer.prompt<{ targetPath: string }>([
    {
      type: "input",
      name: "targetPath",
      message: "Enter file or directory:",
      default: "./migration-previews",
      validate: (inputValue: string) =>
        inputValue.trim().length > 0 || "Please enter a path.",
    },
  ]);

  const { useJson } = await inquirer.prompt<{ useJson: boolean }>([
    {
      type: "confirm",
      name: "useJson",
      message: "Output JSON?",
      default: false,
    },
  ]);

  const { debug } = await inquirer.prompt<{ debug: boolean }>([
    {
      type: "confirm",
      name: "debug",
      message: "Enable debug logs?",
      default: false,
    },
  ]);

  const auditArgs: string[] = [
    targetPath,
    "--validators-root",
    discovered.validatorsRoot,
  ];

  if (selection.ids.length > 0) {
    auditArgs.push("--only", selection.ids.join(","));
  }

  if (useJson) {
    auditArgs.push("--json");
  }

  if (debug) {
    auditArgs.push("--debug");
  }

  console.log("\nRunning migration audit...\n");
  return runMigrationAudit(auditArgs);
}

if (import.meta.main) {
  runMigrationAuditCli()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
}
