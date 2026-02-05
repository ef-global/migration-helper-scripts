import inquirer from "inquirer";
import { spawnSync } from "node:child_process";

type Option = {
  label: string;
  ids: string[];
};

const options: Option[] = [
  { label: "Full audit (all validators)", ids: [] },
  { label: "Component suffixes (-section/-flex-group)", ids: ["suffixes"] },
  { label: "V3-to-V4 field migration", ids: ["v3-to-v4"] },
  {
    label: "Other migrations (carousel/hide/visibility/items/transitions)",
    ids: ["non-v3-to-v4"],
  },
];

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

  const args: string[] = [targetPath];
  if (selection.ids.length > 0) {
    args.push("--only", selection.ids.join(","));
  }
  if (useJson) {
    args.push("--json");
  }

  console.log("\nRunning migration audit...\n");
  const result = spawnSync(
    "bun",
    ["run", "src/scripts/migration-audit.ts", ...args],
    { stdio: "inherit" },
  );

  process.exit(result.status ?? 1);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
