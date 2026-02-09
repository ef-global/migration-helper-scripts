import { processFile } from "../utils/file-loader.js";

type FieldValueSample = {
  valuePath: string;
  value: string;
};

type Observation = {
  riskByField: Map<string, FieldValueSample[]>;
};

type Issue = {
  componentPath: string;
  component: string;
  uid: string | null;
  message: string;
};

const fieldRemovalRules: Record<string, string[]> = {
  "sb-accordion": ["inverse"],
  "sb-avatar": ["stroke", "theme", "inverse"],
  "sb-banner": ["variant"],
  "sb-content-group": ["text_align", "text_color"],
  "sb-countdown-timer": ["inverse"],
  "sb-divider": ["inverse"],
  "sb-form": ["inverse"],
  "sb-link-tile": ["inverse"],
  "sb-list": ["variant", "inverse"],
  "sb-tabs": ["on_dark", "mono"],
  "sb-trustpilot": ["inverse"],
  "sb-video": ["inverse_icon", "play_button_mono"],
  "sb-video-card": ["play_button_mono"],
};

const trackedFields = new Set(Object.values(fieldRemovalRules).flat());
const maxSamplesPerField = 3;
const maxDetailedDebugLogs = 300;

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

function pathKey(path: (string | number)[]): string {
  return path
    .map((segment) =>
      typeof segment === "number" ? `n:${segment}` : `s:${segment}`,
    )
    .join("|");
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

function formatValue(value: unknown): string {
  const raw = JSON.stringify(value);
  if (raw.length <= 80) return raw;
  return `${raw.slice(0, 77)}...`;
}

function isMeaningfulPrimitive(value: unknown): boolean {
  if (value === null) return false;

  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.trim().length > 0;

  return false;
}

function getObservation(
  observations: Map<string, Observation>,
  key: string,
): Observation {
  const existing = observations.get(key);
  if (existing) return existing;
  const created: Observation = {
    riskByField: new Map<string, FieldValueSample[]>(),
  };
  observations.set(key, created);
  return created;
}

function getSamples(
  observation: Observation,
  fieldName: string,
): FieldValueSample[] {
  const existing = observation.riskByField.get(fieldName);
  if (existing) return existing;
  const created: FieldValueSample[] = [];
  observation.riskByField.set(fieldName, created);
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
        "Usage: bun run src/scripts/validate-field-removal-risk.ts <file-path> [--json] [--debug]",
      );
      console.error(
        "Example: bun run src/scripts/validate-field-removal-risk.ts ./migration-previews/file.json --debug",
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
  let trackedValueNodeCount = 0;
  let meaningfulTrackedValueNodeCount = 0;
  let ignoredTrackedValueNodeCount = 0;

  await processFile(filePath, (value, key, path) => {
    visitedNodeCount += 1;

    if (key === "component" && typeof value === "string") {
      const componentPath = path.slice(0, -1);
      const keyStr = pathKey(componentPath);
      componentByPathKey.set(keyStr, value);
      pathByKey.set(keyStr, componentPath);

      if (fieldRemovalRules[value]) {
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
    if (!trackedFields.has(fieldName)) return;

    if (path[designIndex + 3] !== "values") return;
    if (path.length < designIndex + 5) return;

    const absolutePath = formatPath(path);
    const renderedValue = formatValue(value);

    trackedValueNodeCount += 1;
    debugDetail(`inspecting ${absolutePath}=${renderedValue}`);

    if (!isMeaningfulPrimitive(value)) {
      ignoredTrackedValueNodeCount += 1;
      debugDetail(`ignored ${absolutePath} (empty/default value)`);
      return;
    }

    meaningfulTrackedValueNodeCount += 1;
    debugDetail(`meaningful value at ${absolutePath}=${renderedValue}`);

    const componentPath = path.slice(0, designIndex);
    const keyStr = pathKey(componentPath);
    pathByKey.set(keyStr, componentPath);

    const observation = getObservation(observations, keyStr);
    const samples = getSamples(observation, fieldName);

    if (samples.length < maxSamplesPerField) {
      samples.push({
        valuePath: formatRelativePath(path.slice(designIndex + 3)),
        value: renderedValue,
      });
    }
  });

  debugLog(
    `traversal summary for ${filePath}: visited ${visitedNodeCount} nodes, inspected ${trackedValueNodeCount} tracked value nodes (${meaningfulTrackedValueNodeCount} meaningful, ${ignoredTrackedValueNodeCount} ignored)`,
  );

  const issues: Issue[] = [];
  let checkedTargetComponents = 0;

  for (const [keyStr, component] of componentByPathKey.entries()) {
    const fieldsToRemove = fieldRemovalRules[component];
    if (!fieldsToRemove) continue;

    checkedTargetComponents += 1;

    const componentPath = pathByKey.get(keyStr) ?? [];
    const componentPathStr = formatPath(componentPath) || "(root)";
    const uid = uidByPathKey.get(keyStr) ?? null;
    const uidStr = uid ? ` (_uid: ${uid})` : "";
    const observation = observations.get(keyStr);

    debugLog(`checking ${componentPathStr} -> ${component}${uidStr}`);

    let componentIssueCount = 0;

    if (!observation) {
      debugLog(`successfully checked ${componentPathStr} -> ${component}${uidStr}`);
      continue;
    }

    for (const fieldName of fieldsToRemove) {
      const samples = observation.riskByField.get(fieldName);
      if (!samples || samples.length === 0) {
        debugDetail(
          `checked ${componentPathStr} -> ${component}${uidStr}: no meaningful values for design.fields.${fieldName}`,
        );
        continue;
      }

      const sampleText = samples
        .map((sample) => `${sample.valuePath}=${sample.value}`)
        .join(", ");

      issues.push({
        componentPath: componentPathStr,
        component,
        uid,
        message:
          `Field scheduled for removal has non-empty values: design.fields.${fieldName} (${sampleText})`,
      });

      componentIssueCount += 1;
      debugLog(
        `found problem in ${componentPathStr} -> ${component}${uidStr}: design.fields.${fieldName}`,
      );
    }

    if (componentIssueCount === 0) {
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
    console.log("No risky field-removal values found.");
    return;
  }

  console.log(`Found ${issues.length} field-removal risk(s):\n`);
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
