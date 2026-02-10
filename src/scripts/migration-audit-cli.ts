#!/usr/bin/env bun
import inquirer from "inquirer";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverMigrationValidators,
  findDefaultValidatorsRoot,
  type DiscoveredMigrationValidator,
} from "./discover-migration-validators.js";

type Option = {
  label: string;
  ids: string[];
};

const thisFilePath = fileURLToPath(import.meta.url);
const thisDirPath = dirname(thisFilePath);
const auditScriptPath = resolve(thisDirPath, "migration-audit.ts");

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

async function main() {
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

  const args: string[] = [
    targetPath,
    "--validators-root",
    discovered.validatorsRoot,
  ];

  if (selection.ids.length > 0) {
    args.push("--only", selection.ids.join(","));
  }

  if (useJson) {
    args.push("--json");
  }

  if (debug) {
    args.push("--debug");
  }

  console.log("\nRunning migration audit...\n");
  const result = spawnSync("bun", ["run", auditScriptPath, ...args], {
    stdio: "inherit",
  });

  process.exit(result.status ?? 1);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
