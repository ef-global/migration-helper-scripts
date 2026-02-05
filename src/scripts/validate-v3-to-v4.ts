import { processFile } from "../utils/file-loader.js";

type Observation = {
  fields: Set<string>;
  oldItemBasis: boolean;
  oldEmbedWidth: boolean;
  oldEmbedHeight: boolean;
};

type Issue = {
  componentPath: string;
  component: string;
  uid: string | null;
  message: string;
};

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

function getObservation(
  observations: Map<string, Observation>,
  key: string,
): Observation {
  const existing = observations.get(key);
  if (existing) return existing;
  const created: Observation = {
    fields: new Set<string>(),
    oldItemBasis: false,
    oldEmbedWidth: false,
    oldEmbedHeight: false,
  };
  observations.set(key, created);
  return created;
}

const rules: Record<
  string,
  {
    forbiddenFields?: string[];
    requireFields?: string[];
    checkItemBasis?: boolean;
    checkEmbedSizes?: boolean;
  }
> = {
  "sb-button-group": {
    forbiddenFields: ["layout", "item_flex"],
    checkItemBasis: true,
  },
  "sb-link": {
    forbiddenFields: ["variant", "small", "mono", "underline"],
    checkItemBasis: true,
  },
  "sb-card": {
    forbiddenFields: ["horizontal", "background", "on_dark"],
  },
  "sb-body-text": {
    forbiddenFields: ["view_more"],
    checkItemBasis: true,
  },
  "sb-collapsible": {
    forbiddenFields: ["direction", "gap", "wrap", "justify", "align", "text_color"],
  },
  "sb-social-embed": {
    forbiddenFields: ["item_width", "item_height"],
    checkEmbedSizes: true,
  },
  "sb-iframe": {
    forbiddenFields: ["aspectRatio"],
  },
  "sb-accordion": {
    forbiddenFields: ["inverse"],
    checkItemBasis: true,
  },
  "sb-avatar": {
    forbiddenFields: ["stroke", "theme", "inverse"],
  },
  "sb-banner": {
    forbiddenFields: ["variant"],
  },
  "sb-content-group": {
    forbiddenFields: ["text_align", "text_color"],
  },
  "sb-countdown-timer": {
    forbiddenFields: ["inverse"],
  },
  "sb-divider": {
    forbiddenFields: ["inverse"],
  },
  "sb-form": {
    forbiddenFields: ["inverse"],
  },
  "sb-link-tile": {
    forbiddenFields: ["inverse"],
  },
  "sb-list": {
    forbiddenFields: ["variant", "inverse"],
  },
  "sb-tabs": {
    forbiddenFields: ["on_dark", "mono"],
  },
  "sb-video": {
    forbiddenFields: ["inverse_icon", "play_button_mono"],
  },
  "sb-video-card": {
    forbiddenFields: ["play_button_mono"],
  },
  "sb-trustpilot": {
    forbiddenFields: ["inverse"],
  },
  "sb-teaser-card": {
    requireFields: ["visibility"],
  },
  "sb-tag": { checkItemBasis: true },
  "sb-text": { checkItemBasis: true },
  "sb-icon": { checkItemBasis: true },
  "sb-image": { checkItemBasis: true },
  "sb-headline": { checkItemBasis: true },
  "sb-blockquote": { checkItemBasis: true },
  "sb-surface": { checkItemBasis: true },
  "sb-surface-card": { checkItemBasis: true },
  "sb-flex-group": { checkItemBasis: true },
  "sb-card-flipper": { checkItemBasis: true },
  "sb-collapsible-simple": { checkItemBasis: true },
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
        "Usage: bun run src/scripts/validate-v3-to-v4.ts <file-path> [--json]",
      );
      console.error(
        "Example: bun run src/scripts/validate-v3-to-v4.ts ./migration-previews/file.json",
      );
    }
    process.exit(1);
  }

  const componentByPathKey = new Map<string, string>();
  const pathByKey = new Map<string, (string | number)[]>();
  const uidByPathKey = new Map<string, string>();
  const observations = new Map<string, Observation>();

  await processFile(filePath, (value, key, path) => {
    if (key === "component" && typeof value === "string") {
      const componentPath = path.slice(0, -1);
      const keyStr = pathKey(componentPath);
      componentByPathKey.set(keyStr, value);
      pathByKey.set(keyStr, componentPath);
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

    const componentPath = path.slice(0, designIndex);
    const keyStr = pathKey(componentPath);
    pathByKey.set(keyStr, componentPath);
    const observation = getObservation(observations, keyStr);
    observation.fields.add(fieldName);

    if (fieldName === "item_basis" && path[designIndex + 3] === "values") {
      if (path.length === designIndex + 5) {
        observation.oldItemBasis = true;
      }
    }

    if (fieldName === "embed_width" && path[designIndex + 3] === "values") {
      if (path.length === designIndex + 5) {
        observation.oldEmbedWidth = true;
      }
    }

    if (fieldName === "embed_height" && path[designIndex + 3] === "values") {
      if (path.length === designIndex + 5) {
        observation.oldEmbedHeight = true;
      }
    }
  });

  const issues: Issue[] = [];

  for (const [keyStr, component] of componentByPathKey.entries()) {
    const observation =
      observations.get(keyStr) ??
      ({
        fields: new Set<string>(),
        oldItemBasis: false,
        oldEmbedWidth: false,
        oldEmbedHeight: false,
      } as Observation);
    const componentPath = pathByKey.get(keyStr) ?? [];
    const componentPathStr = formatPath(componentPath) || "(root)";
    const uid = uidByPathKey.get(keyStr) ?? null;
    const rule = rules[component];

    if (rule?.forbiddenFields) {
      for (const field of rule.forbiddenFields) {
        if (observation.fields.has(field)) {
          issues.push({
            componentPath: componentPathStr,
            component,
            uid,
            message: `Forbidden field still present: design.fields.${field}`,
          });
        }
      }
    }

    if (rule?.requireFields) {
      for (const field of rule.requireFields) {
        if (!observation.fields.has(field)) {
          issues.push({
            componentPath: componentPathStr,
            component,
            uid,
            message: `Required field missing: design.fields.${field}`,
          });
        }
      }
    }

    if (rule?.checkItemBasis && observation.oldItemBasis) {
      issues.push({
        componentPath: componentPathStr,
        component,
        uid,
        message:
          "item_basis values still in V3 format (expected backpack-size objects with value/unit).",
      });
    }

    if (rule?.checkEmbedSizes) {
      if (observation.oldEmbedWidth) {
        issues.push({
          componentPath: componentPathStr,
          component,
          uid,
          message:
            "embed_width values still in V3 format (expected backpack-size objects).",
        });
      }
      if (observation.oldEmbedHeight) {
        issues.push({
          componentPath: componentPathStr,
          component,
          uid,
          message:
            "embed_height values still in V3 format (expected backpack-size objects).",
        });
      }
    }
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

  if (issues.length === 0) {
    console.log("No V3-to-V4 field-migration issues found.");
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
