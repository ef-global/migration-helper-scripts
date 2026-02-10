import { processFile } from "../utils/file-loader.js";

export type Issue = {
  componentPath: string;
  component: string;
  uid: string | null;
  message: string;
};

type Observation = {
  fields: Set<string>;
  legacyItemBasis: string[];
  legacyEmbedWidth: string[];
  legacyEmbedHeight: string[];
};

export type ComponentRule = {
  forbiddenFields?: string[];
  requiredFields?: string[];
  forbiddenTopLevelKeys?: string[];
  requiredTopLevelKeys?: string[];
  checkItemBasis?: boolean;
  checkEmbedSizes?: boolean;
};

export type WrapperNormalizationRule = {
  wrapperToBase: Record<string, string>;
};

export type RuleSetConfig = {
  ruleSetName: string;
  rules: Record<string, ComponentRule>;
  noIssuesMessage: string;
  wrapperNormalization?: WrapperNormalizationRule;
};

export type RuleSetRunOptions = {
  isDebug?: boolean;
};

export type RuleSetReport = {
  file: string;
  ok: boolean;
  issueCount: number;
  issues: Issue[];
};

type CliArgs = {
  filePath: string | null;
  isJson: boolean;
  isDebug: boolean;
  unknownFlags: string[];
};

const maxFormatSamplesPerComponent = 3;
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
  return !(
    typeof maybeSize.value === "string" && typeof maybeSize.unit === "string"
  );
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

function getKeySet(
  map: Map<string, Set<string>>,
  key: string,
): Set<string> {
  const existing = map.get(key);
  if (existing) return existing;
  const created = new Set<string>();
  map.set(key, created);
  return created;
}

function parseCliArgs(args: string[]): CliArgs {
  const unknownFlags: string[] = [];
  const isJson = args.includes("--json");
  const isDebug = args.includes("--debug");
  let filePath: string | null = null;

  for (const arg of args) {
    if (arg === "--json" || arg === "--debug") {
      continue;
    }

    if (arg.startsWith("--")) {
      unknownFlags.push(arg);
      continue;
    }

    if (filePath === null) {
      filePath = arg;
    }
  }

  return { filePath, isJson, isDebug, unknownFlags };
}

function printMissingPathError(
  scriptPath: string,
  config: RuleSetConfig,
  isJson: boolean,
) {
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
    return;
  }

  console.error(
    `Usage: bun run ${scriptPath} <file-path> [--json] [--debug]`,
  );
  console.error(
    `Example: bun run ${scriptPath} ./migration-previews/file.json --debug`,
  );
  console.error(`Validator: ${config.ruleSetName}`);
}

export async function validateRuleSet(
  filePath: string,
  config: RuleSetConfig,
  options: RuleSetRunOptions = {},
): Promise<RuleSetReport> {
  const isDebug = Boolean(options.isDebug);
  let detailLogCount = 0;

  const trackedFields = new Set(
    Object.values(config.rules).flatMap((rule) => [
      ...(rule.forbiddenFields ?? []),
      ...(rule.requiredFields ?? []),
    ]),
  );
  const hasItemBasisChecks = Object.values(config.rules).some(
    (rule) => rule.checkItemBasis,
  );
  const hasEmbedSizeChecks = Object.values(config.rules).some(
    (rule) => rule.checkEmbedSizes,
  );

  const targetComponents = new Set(Object.keys(config.rules));
  const normalizedWrappers = config.wrapperNormalization?.wrapperToBase ?? {};
  const trackedWrapperComponents = new Set(Object.keys(normalizedWrappers));

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

  debugLog(`checking file ${filePath}`);

  const componentByPathKey = new Map<string, string>();
  const pathByKey = new Map<string, (string | number)[]>();
  const uidByPathKey = new Map<string, string>();
  const observations = new Map<string, Observation>();
  const objectKeysByPathKey = new Map<string, Set<string>>();

  let visitedNodeCount = 0;
  let trackedFieldNodeCount = 0;

  await processFile(filePath, (value, key, path) => {
    visitedNodeCount += 1;

    if (typeof key === "string") {
      const parentPath = path.slice(0, -1);
      const parentKey = pathKey(parentPath);
      const keySet = getKeySet(objectKeysByPathKey, parentKey);
      keySet.add(key);
      pathByKey.set(parentKey, parentPath);
    }

    if (key === "component" && typeof value === "string") {
      const componentPath = path.slice(0, -1);
      const keyStr = pathKey(componentPath);
      componentByPathKey.set(keyStr, value);
      pathByKey.set(keyStr, componentPath);

      if (targetComponents.has(value) || trackedWrapperComponents.has(value)) {
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
      debugDetail(
        `saw design.fields.${fieldName} at ${formatPath(path.slice(0, designIndex + 3))}`,
      );
    }

    if (path[designIndex + 3] !== "values") return;
    if (path.length !== designIndex + 5) return;

    const valuePath = formatRelativePath(path.slice(designIndex + 3));

    if (hasItemBasisChecks && fieldName === "item_basis" && isLegacySizeValue(value)) {
      if (observation.legacyItemBasis.length < maxFormatSamplesPerComponent) {
        observation.legacyItemBasis.push(valuePath);
      }
      debugDetail(
        `found legacy item_basis value at ${formatPath(path)}=${JSON.stringify(value)}`,
      );
    }

    if (
      hasEmbedSizeChecks &&
      fieldName === "embed_width" &&
      isLegacySizeValue(value)
    ) {
      if (observation.legacyEmbedWidth.length < maxFormatSamplesPerComponent) {
        observation.legacyEmbedWidth.push(valuePath);
      }
      debugDetail(
        `found legacy embed_width value at ${formatPath(path)}=${JSON.stringify(value)}`,
      );
    }

    if (
      hasEmbedSizeChecks &&
      fieldName === "embed_height" &&
      isLegacySizeValue(value)
    ) {
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
    const componentPath = pathByKey.get(keyStr) ?? [];
    const componentPathStr = formatPath(componentPath) || "(root)";
    const uid = uidByPathKey.get(keyStr) ?? null;
    const uidStr = uid ? ` (_uid: ${uid})` : "";
    const topLevelKeys = objectKeysByPathKey.get(keyStr) ?? new Set<string>();
    const observation =
      observations.get(keyStr) ??
      ({
        fields: new Set<string>(),
        legacyItemBasis: [],
        legacyEmbedWidth: [],
        legacyEmbedHeight: [],
      } as Observation);

    if (!config.rules[component] && !normalizedWrappers[component]) {
      continue;
    }

    checkedTargetComponents += 1;
    debugLog(`checking ${componentPathStr} -> ${component}${uidStr}`);

    let componentIssueCount = 0;
    const rule = config.rules[component];

    if (rule) {
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

      for (const field of rule.requiredFields ?? []) {
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

      for (const topLevelKey of rule.forbiddenTopLevelKeys ?? []) {
        if (topLevelKeys.has(topLevelKey)) {
          issues.push({
            componentPath: componentPathStr,
            component,
            uid,
            message: `Forbidden top-level key still present: ${topLevelKey}`,
          });
          componentIssueCount += 1;
        }
      }

      for (const topLevelKey of rule.requiredTopLevelKeys ?? []) {
        if (!topLevelKeys.has(topLevelKey)) {
          issues.push({
            componentPath: componentPathStr,
            component,
            uid,
            message: `Required top-level key missing: ${topLevelKey}`,
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
    }

    const expectedBaseComponent = normalizedWrappers[component];
    if (expectedBaseComponent) {
      issues.push({
        componentPath: componentPathStr,
        component,
        uid,
        message: `Wrapper component still present: component=${component} (expected ${expectedBaseComponent})`,
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

  return {
    file: filePath,
    ok: issues.length === 0,
    issueCount: issues.length,
    issues,
  };
}

export async function runRuleSetValidatorCli(
  config: RuleSetConfig,
  scriptPath: string,
): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.unknownFlags.length > 0) {
    for (const flag of parsed.unknownFlags) {
      console.error(`Unknown flag: ${flag}`);
    }
    process.exit(1);
  }

  if (!parsed.filePath) {
    printMissingPathError(scriptPath, config, parsed.isJson);
    process.exit(1);
  }

  const report = await validateRuleSet(parsed.filePath, config, {
    isDebug: parsed.isDebug,
  });

  if (parsed.isJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (report.issueCount === 0) {
    console.log(config.noIssuesMessage);
    return;
  }

  console.log(`Found ${report.issueCount} potential migration issue(s):\n`);
  for (const issue of report.issues) {
    const uidStr = issue.uid ? ` (_uid: ${issue.uid})` : "";
    console.log(
      `  ${issue.componentPath} -> ${issue.component}${uidStr}  ${issue.message}`,
    );
  }
}
