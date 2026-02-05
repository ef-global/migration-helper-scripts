import { processFile } from "../utils/file-loader.js";
import type { ComponentMatch } from "../types.js";

function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const withWildcards = escaped.replace(/\*/g, ".*");
  return new RegExp(`^${withWildcards}$`);
}

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

async function main() {
  const [filePath, pattern] = process.argv.slice(2);

  if (!filePath || !pattern) {
    console.error("Usage: bun run src/scripts/find-components.ts <file-path> <pattern>");
    console.error('Example: bun run src/scripts/find-components.ts ./data.json "*-section"');
    process.exit(1);
  }

  const regex = globToRegex(pattern);
  const matches: ComponentMatch[] = [];

  // We need to collect component objects, so we track parent objects
  // that have a "component" field matching the pattern.
  // Strategy: collect all nodes where key === "component" and value matches,
  // then look up the _uid from the parent object via a second pass.

  // For efficiency with in-memory mode, we do a single pass:
  // When we encounter key="component" with a matching value,
  // we record the parent path. Then when we encounter key="_uid"
  // at the same parent path, we attach it.

  const parentPathToMatch = new Map<string, ComponentMatch>();

  await processFile(filePath, (value, key, path) => {
    if (key === "component" && typeof value === "string" && regex.test(value)) {
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

    if (key === "_uid" && typeof value === "string") {
      const parentPath = path.slice(0, -1);
      const parentPathStr = formatPath(parentPath);
      const existing = parentPathToMatch.get(parentPathStr);
      if (existing) {
        existing.uid = value;
      }
    }
  });

  if (matches.length === 0) {
    console.log(`No components matching "${pattern}" found.`);
    return;
  }

  console.log(`Found ${matches.length} component(s) matching "${pattern}":\n`);
  for (const match of matches) {
    const uidStr = match.uid ? ` (_uid: ${match.uid})` : "";
    console.log(`  ${match.path} → ${match.component}${uidStr}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
