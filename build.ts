#!/usr/bin/env bun
import { $ } from "bun";
import { dirname, join } from "node:path";

type BuildTarget = {
  name: string;
  target: string;
  extension: string;
};

const rootDir = dirname(import.meta.path);
const srcCli = join(rootDir, "src", "cli.ts");
const binDir = join(rootDir, "bin");

const targets: BuildTarget[] = [
  { name: "darwin-arm64", target: "bun-darwin-arm64", extension: "" },
  { name: "darwin-x64", target: "bun-darwin-x64", extension: "" },
  { name: "linux-x64", target: "bun-linux-x64", extension: "" },
  { name: "linux-arm64", target: "bun-linux-arm64", extension: "" },
  { name: "windows-x64", target: "bun-windows-x64", extension: ".exe" },
];

function getCurrentTarget(): BuildTarget | null {
  const platform = process.platform;
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const current = `${platform}-${arch}`;
  return targets.find((target) => target.name === current) ?? null;
}

async function buildFor(buildTargets: BuildTarget[]): Promise<void> {
  await $`mkdir -p ${binDir}`;

  for (const buildTarget of buildTargets) {
    const outputName = `migration-helper-${buildTarget.name}${buildTarget.extension}`;
    const outputPath = join(binDir, outputName);

    console.log(`Building ${outputName}...`);

    await $`bun build ${srcCli} --compile --minify --bytecode --target=${buildTarget.target} --outfile=${outputPath}`;
    console.log(`Created bin/${outputName}`);
  }
}

async function main(): Promise<void> {
  const buildAll = process.argv.slice(2).includes("--all");

  if (buildAll) {
    await buildFor(targets);
    return;
  }

  const currentTarget = getCurrentTarget();
  if (!currentTarget) {
    console.error(
      `Unsupported host platform for default build: ${process.platform}-${process.arch}`,
    );
    process.exit(1);
  }

  await buildFor([currentTarget]);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
