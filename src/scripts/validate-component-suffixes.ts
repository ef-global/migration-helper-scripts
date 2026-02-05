import { processFile } from "../utils/file-loader.js";
import type { ComponentMatch } from "../types.js";

function formatPath(path: (string | number)[]): string {
  return path
    .map((segment, i) => {
      if (typeof segment === "number") return `[${segment}]`;
      if (i === 0) return segment;
      return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(segment)
        ? `.${segment}`
        : `["${segment}"]`;
    })
    .join("");
}

const forbiddenSuffixes = ["-section", "-flex-group"];
const allowedExact = new Set(["sb-section", "sb-flex-group"]);

type Issue = {
  path: string;
  component: string;
  uid: string | null;
  message: string;
};

async function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes("--json");
  const filePath = args.find((arg) => !arg.startsWith("--"));

  if (!filePath) {
    if (isJson) {
      console.log(
        JSON.stringify(
          {
            file: null,
            ok: false,
            issueCount: 1,
            issues: [
              {
                path: "",
                component: "",
                uid: null,
                message: "Missing file path argument.",
              },
            ],
          },
          null,
          2,
        ),
      );
    } else {
      console.error(
        "Usage: bun run src/scripts/validate-component-suffixes.ts <file-path> [--json]",
      );
      console.error(
        "Example: bun run src/scripts/validate-component-suffixes.ts ./migration-previews/file.json",
      );
    }
    process.exit(1);
  }

  const matches: ComponentMatch[] = [];
  const issues: Issue[] = [];
  const parentPathToMatch = new Map<string, ComponentMatch>();

  await processFile(filePath, (value, key, path) => {
    if (key === "component" && typeof value === "string") {
      const isForbidden =
        !allowedExact.has(value) &&
        forbiddenSuffixes.some((suffix) => value.endsWith(suffix));

      if (isForbidden) {
        const parentPath = path.slice(0, -1);
        const parentPathStr = formatPath(parentPath);
        const match: ComponentMatch = {
          path: parentPathStr || "(root)",
          component: value,
          uid: null,
        };
        parentPathToMatch.set(parentPathStr, match);
        matches.push(match);
      }
    }

    if (key === "_uid" && typeof value === "string") {
      const parentPath = path.slice(0, -1);
      const parentPathStr = formatPath(parentPath);
      const existing = parentPathToMatch.get(parentPathStr);
      if (existing) {
        existing.uid = value;
      }
    }
  });

  for (const match of matches) {
    issues.push({
      path: match.path,
      component: match.component,
      uid: match.uid,
      message: "Component still has forbidden suffix (-section or -flex-group).",
    });
  }

  if (isJson) {
    console.log(
      JSON.stringify(
        {
          file: filePath,
          ok: issues.length === 0,
          issueCount: issues.length,
          issues,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (matches.length === 0) {
    console.log(
      "No remaining components with -section or -flex-group suffixes (excluding sb-section/sb-flex-group).",
    );
    return;
  }

  console.log(
    `Found ${matches.length} remaining component(s) with forbidden suffixes:\n`,
  );
  for (const match of matches) {
    const uidStr = match.uid ? ` (_uid: ${match.uid})` : "";
    console.log(`  ${match.path} → ${match.component}${uidStr}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
