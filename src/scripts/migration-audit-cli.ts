#!/usr/bin/env bun
import inquirer from "inquirer";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Option = {
  label: string;
  ids: string[];
};

const options: Option[] = [
  { label: "Full audit (all validators)", ids: [] },
  { label: "Component suffixes (-section/-flex-group)", ids: ["suffixes"] },
  { label: "V3-to-V4 field migration", ids: ["v3-to-v4"] },
  {
    label: "Field-removal safety (non-empty removed values)",
    ids: ["field-removal-risk"],
  },
  {
    label: "Other migrations (carousel/hide/visibility/items/transitions)",
    ids: ["non-v3-to-v4"],
  },
];

const thisFilePath = fileURLToPath(import.meta.url);
const thisDirPath = dirname(thisFilePath);
const auditScriptPath = resolve(thisDirPath, "migration-audit.ts");

async function main() {
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

  const args: string[] = [targetPath];
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
