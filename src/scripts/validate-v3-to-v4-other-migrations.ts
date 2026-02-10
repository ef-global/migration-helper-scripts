import { processFile } from "../utils/file-loader.js";

type Observation = {
  fields: Set<string>;
  legacyItemBasis: string[];
  legacyEmbedWidth: string[];
  legacyEmbedHeight: string[];
};

type Issue = {
  componentPath: string;
  component: string;
  uid: string | null;
  message: string;
};

type Rule = {
  forbiddenFields?: string[];
  requireFields?: string[];
  checkItemBasis?: boolean;
  checkEmbedSizes?: boolean;
};

const rules: Record<string, Rule> = {
  "sb-body-text": {
    forbiddenFields: ["view_more"],
    checkItemBasis: true,
  },
  "sb-button-group": {
    forbiddenFields: ["layout", "item_flex"],
    checkItemBasis: true,
  },
  "sb-card": {
    forbiddenFields: ["horizontal", "background", "on_dark"],
  },
  "sb-collapsible": {
    forbiddenFields: ["direction", "gap", "wrap", "justify", "align", "text_color"],
  },
  "sb-iframe": {
    forbiddenFields: ["aspectRatio"],
  },
  "sb-link": {
    forbiddenFields: ["variant", "small", "mono", "underline"],
    checkItemBasis: true,
  },
  "sb-social-embed": {
    forbiddenFields: ["item_width", "item_height"],
    checkEmbedSizes: true,
  },
  "sb-teaser-card": {
    requireFields: ["visibility"],
  },
};

const maxFormatSamplesPerComponent = 3;
const maxDetailedDebugLogs = 300;
const trackedFields = new Set(
  Object.values(rules)
    .flatMap((rule) => [...(rule.forbiddenFields ?? []), ...(rule.requireFields ?? [])]),
);

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

function formatRelativePath(path: (string | number)[]): string {
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

function pathKey(path: (string | number)[]): string {
  return path
    .map((segment) =>
      typeof segment === "number" ? `n:${segment}` : `s:${segment}`,
    )
    .join("|");
}

function isLegacySizeValue(value: unknown): boolean {
  if (value === null) return false;
  if (typeof value === "string") return true;
  if (typeof value === "number") return true;
  if (typeof value === "boolean") return true;

  if (typeof value !== "object") return false;

  const maybeSize = value as { value?: unknown; unit?: unknown };
  return !(typeof maybeSize.value === "string" && typeof maybeSize.unit === "string");
}

function getObservation(
  observations: Map<string, Observation>,
  key: string,
): Observation {
  const existing = observations.get(key);
  if (existing) return existing;
  const created: Observation = {
    fields: new Set<string>(),
    legacyItemBasis: [],
    legacyEmbedWidth: [],
    legacyEmbedHeight: [],
  };
  observations.set(key, created);
  return created;
}

async function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes("--json");
  const isDebug = args.includes("--debug");
  const filePath = args.find((arg) => !arg.startsWith("--"));

  let detailLogCount = 0;

  const debugLog = (message: string) => {
    if (isDebug) {
      console.error(`[debug] ${message}`);
    }
  };

  const debugDetail = (message: string) => {
    if (!isDebug) return;

    if (detailLogCount < maxDetailedDebugLogs) {
      console.error(`[debug] ${message}`);
      detailLogCount += 1;
      if (detailLogCount === maxDetailedDebugLogs) {
        console.error(
          `[debug] detail log limit reached (${maxDetailedDebugLogs}); suppressing additional per-path logs`,
        );
      }
    }
  };

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
                componentPath: "",
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
        "Usage: bun run src/scripts/validate-v3-to-v4-other-migrations.ts <file-path> [--json] [--debug]",
      );
      console.error(
        "Example: bun run src/scripts/validate-v3-to-v4-other-migrations.ts ./migration-previews/file.json --debug",
      );
    }
    process.exit(1);
  }

  debugLog(`checking file ${filePath}`);

  const componentByPathKey = new Map<string, string>();
  const pathByKey = new Map<string, (string | number)[]>();
  const uidByPathKey = new Map<string, string>();
  const observations = new Map<string, Observation>();

  let visitedNodeCount = 0;
  let trackedFieldNodeCount = 0;

  await processFile(filePath, (value, key, path) => {
    visitedNodeCount += 1;

    if (key === "component" && typeof value === "string") {
      const componentPath = path.slice(0, -1);
      const keyStr = pathKey(componentPath);
      componentByPathKey.set(keyStr, value);
      pathByKey.set(keyStr, componentPath);

      if (rules[value]) {
        debugDetail(
          `found target component ${value} at ${formatPath(componentPath) || "(root)"}`,
        );
      }
    }

    if (key === "_uid" && typeof value === "string") {
      const componentPath = path.slice(0, -1);
      const keyStr = pathKey(componentPath);
      uidByPathKey.set(keyStr, value);
      pathByKey.set(keyStr, componentPath);
    }

    const designIndex = path.indexOf("design");
    if (designIndex === -1) return;
    if (path[designIndex + 1] !== "fields") return;
    const fieldName = path[designIndex + 2];
    if (typeof fieldName !== "string") return;

    trackedFieldNodeCount += 1;

    const componentPath = path.slice(0, designIndex);
    const keyStr = pathKey(componentPath);
    pathByKey.set(keyStr, componentPath);
    const observation = getObservation(observations, keyStr);

    if (path.length === designIndex + 3) {
      observation.fields.add(fieldName);
    }
    if (trackedFields.has(fieldName) && path.length === designIndex + 3) {
      debugDetail(`saw design.fields.${fieldName} at ${formatPath(path.slice(0, designIndex + 3))}`);
    }

    if (path[designIndex + 3] !== "values") return;
    if (path.length !== designIndex + 5) return;

    const valuePath = formatRelativePath(path.slice(designIndex + 3));

    if (fieldName === "item_basis" && isLegacySizeValue(value)) {
      if (observation.legacyItemBasis.length < maxFormatSamplesPerComponent) {
        observation.legacyItemBasis.push(valuePath);
      }
      debugDetail(
        `found legacy item_basis value at ${formatPath(path)}=${JSON.stringify(value)}`,
      );
    }

    if (fieldName === "embed_width" && isLegacySizeValue(value)) {
      if (observation.legacyEmbedWidth.length < maxFormatSamplesPerComponent) {
        observation.legacyEmbedWidth.push(valuePath);
      }
      debugDetail(
        `found legacy embed_width value at ${formatPath(path)}=${JSON.stringify(value)}`,
      );
    }

    if (fieldName === "embed_height" && isLegacySizeValue(value)) {
      if (observation.legacyEmbedHeight.length < maxFormatSamplesPerComponent) {
        observation.legacyEmbedHeight.push(valuePath);
      }
      debugDetail(
        `found legacy embed_height value at ${formatPath(path)}=${JSON.stringify(value)}`,
      );
    }
  });

  debugLog(
    `traversal summary for ${filePath}: visited ${visitedNodeCount} nodes, touched ${trackedFieldNodeCount} design field nodes`,
  );

  const issues: Issue[] = [];
  let checkedTargetComponents = 0;

  for (const [keyStr, component] of componentByPathKey.entries()) {
    const rule = rules[component];
    if (!rule) continue;

    checkedTargetComponents += 1;

    const componentPath = pathByKey.get(keyStr) ?? [];
    const componentPathStr = formatPath(componentPath) || "(root)";
    const uid = uidByPathKey.get(keyStr) ?? null;
    const uidStr = uid ? ` (_uid: ${uid})` : "";
    const observation =
      observations.get(keyStr) ??
      ({
        fields: new Set<string>(),
        legacyItemBasis: [],
        legacyEmbedWidth: [],
        legacyEmbedHeight: [],
      } as Observation);

    debugLog(`checking ${componentPathStr} -> ${component}${uidStr}`);
    let componentIssueCount = 0;

    for (const field of rule.forbiddenFields ?? []) {
      if (observation.fields.has(field)) {
        issues.push({
          componentPath: componentPathStr,
          component,
          uid,
          message: `Forbidden field still present: design.fields.${field}`,
        });
        componentIssueCount += 1;
      }
    }

    for (const field of rule.requireFields ?? []) {
      if (!observation.fields.has(field)) {
        issues.push({
          componentPath: componentPathStr,
          component,
          uid,
          message: `Required field missing: design.fields.${field}`,
        });
        componentIssueCount += 1;
      }
    }

    if (rule.checkItemBasis && observation.legacyItemBasis.length > 0) {
      issues.push({
        componentPath: componentPathStr,
        component,
        uid,
        message: `item_basis values still in V3 format (${observation.legacyItemBasis.join(", ")})`,
      });
      componentIssueCount += 1;
    }

    if (rule.checkEmbedSizes && observation.legacyEmbedWidth.length > 0) {
      issues.push({
        componentPath: componentPathStr,
        component,
        uid,
        message: `embed_width values still in V3 format (${observation.legacyEmbedWidth.join(", ")})`,
      });
      componentIssueCount += 1;
    }

    if (rule.checkEmbedSizes && observation.legacyEmbedHeight.length > 0) {
      issues.push({
        componentPath: componentPathStr,
        component,
        uid,
        message: `embed_height values still in V3 format (${observation.legacyEmbedHeight.join(", ")})`,
      });
      componentIssueCount += 1;
    }

    if (componentIssueCount > 0) {
      debugLog(
        `found problem in ${componentPathStr} -> ${component}${uidStr}: ${componentIssueCount} issue(s)`,
      );
    } else {
      debugLog(`successfully checked ${componentPathStr} -> ${component}${uidStr}`);
    }
  }

  debugLog(
    `finished file ${filePath} (checked ${checkedTargetComponents} target components, found ${issues.length} issues)`,
  );

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

  if (issues.length === 0) {
    console.log("No V3-to-V4 other-migration issues found.");
    return;
  }

  console.log(`Found ${issues.length} potential migration issue(s):\n`);
  for (const issue of issues) {
    const uidStr = issue.uid ? ` (_uid: ${issue.uid})` : "";
    console.log(
      `  ${issue.componentPath} -> ${issue.component}${uidStr}  ${issue.message}`,
    );
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
