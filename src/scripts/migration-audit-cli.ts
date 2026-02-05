import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

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

async function promptSelection(rl: ReturnType<typeof createInterface>): Promise<Option> {
  while (true) {
    console.log("\nSelect a migration validation to run:");
    for (let i = 0; i < options.length; i++) {
      console.log(`  ${i + 1}. ${options[i].label}`);
    }

    const answer = (await rl.question("Enter number (default 1): ")).trim();
    const index = answer ? Number(answer) : 1;

    if (Number.isInteger(index) && index >= 1 && index <= options.length) {
      return options[index - 1];
    }

    console.log("Invalid selection. Please enter a number from the list.");
  }
}

async function promptPath(rl: ReturnType<typeof createInterface>): Promise<string> {
  const answer = (await rl.question(
    "Enter file or directory (default: ./migration-previews): ",
  )).trim();
  return answer || "./migration-previews";
}

async function promptJson(rl: ReturnType<typeof createInterface>): Promise<boolean> {
  const answer = (await rl.question("Output JSON? (y/N): ")).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

async function main() {
  const rl = createInterface({ input, output });

  try {
    const selection = await promptSelection(rl);
    const targetPath = await promptPath(rl);
    const useJson = await promptJson(rl);

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
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
