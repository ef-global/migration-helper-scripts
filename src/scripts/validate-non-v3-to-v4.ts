import { processFile } from "../utils/file-loader.js";

type Observation = {
  designFields: Set<string>;
  hideHasBoolean: boolean;
  visibilityHasBoolean: boolean;
  transitionsHasLegacyString: boolean;
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

function getObservation(
  observations: Map<string, Observation>,
  key: string,
): Observation {
  const existing = observations.get(key);
  if (existing) return existing;
  const created: Observation = {
    designFields: new Set<string>(),
    hideHasBoolean: false,
    visibilityHasBoolean: false,
    transitionsHasLegacyString: false,
  };
  observations.set(key, created);
  return created;
}

const itemsToContentComponents = new Set(["sb-accordion", "sb-list", "sb-tabs"]);
const deprecatedCardCarouselComponents = new Set([
  "sb-card-carousel",
  "sb-card-carousel-section",
]);

const carouselComponents = new Set([
  "sb-carousel",
  "sb-carousel-section",
  "sb-hero-carousel",
]);

const carouselForbiddenDesignFields = [
  "layout",
  "start_at_index",
  "center_slides",
  "autoplay_interval",
  "controls_type",
  "pagination_type",
  "controls_bg_color",
  "controls_color",
  "scroll_to_highlighted_slide_on_click",
  "play_highlighted_video",
  "paginated",
  "inverse",
];

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
        "Usage: bun run src/scripts/validate-non-v3-to-v4.ts <file-path> [--json]",
      );
      console.error(
        "Example: bun run src/scripts/validate-non-v3-to-v4.ts ./migration-previews/file.json",
      );
    }
    process.exit(1);
  }

  const componentByPathKey = new Map<string, string>();
  const pathByKey = new Map<string, (string | number)[]>();
  const uidByPathKey = new Map<string, string>();
  const observations = new Map<string, Observation>();
  const objectKeysByPathKey = new Map<string, Set<string>>();

  await processFile(filePath, (value, key, path) => {
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
    observation.designFields.add(fieldName);

    if (path[designIndex + 3] === "values" && path.length === designIndex + 5) {
      if (fieldName === "hide" && typeof value === "boolean") {
        observation.hideHasBoolean = true;
      }

      if (fieldName === "visibility" && typeof value === "boolean") {
        observation.visibilityHasBoolean = true;
      }

      if (
        fieldName === "transitionsOnEnter" &&
        typeof value === "string" &&
        (value === "enabled" || value === "disabled")
      ) {
        observation.transitionsHasLegacyString = true;
      }
    }
  });

  const issues: Issue[] = [];

  for (const [keyStr, component] of componentByPathKey.entries()) {
    const componentPath = pathByKey.get(keyStr) ?? [];
    const componentPathStr = formatPath(componentPath) || "(root)";
    const uid = uidByPathKey.get(keyStr) ?? null;
    const observation = observations.get(keyStr);
    const topLevelKeys = objectKeysByPathKey.get(keyStr) ?? new Set<string>();

    if (deprecatedCardCarouselComponents.has(component)) {
      issues.push({
        componentPath: componentPathStr,
        component,
        uid,
        message:
          "Deprecated component still present (expected sb-carousel or sb-carousel-section).",
      });
    }

    if (itemsToContentComponents.has(component) && topLevelKeys.has("items")) {
      issues.push({
        componentPath: componentPathStr,
        component,
        uid,
        message: "Legacy items field still present (expected content).",
      });
    }

    if (observation?.designFields.has("hide")) {
      if (!observation.designFields.has("visibility")) {
        issues.push({
          componentPath: componentPathStr,
          component,
          uid,
          message:
            "design.fields.hide present but visibility missing (hideToVisibility not applied).",
        });
      }

      if (observation.hideHasBoolean) {
        issues.push({
          componentPath: componentPathStr,
          component,
          uid,
          message:
            "design.fields.hide still has boolean values (expected show/hide strings).",
        });
      }
    }

    if (observation?.visibilityHasBoolean) {
      issues.push({
        componentPath: componentPathStr,
        component,
        uid,
        message:
          "design.fields.visibility still has boolean values (expected show/hide strings).",
      });
    }

    if (observation?.transitionsHasLegacyString) {
      issues.push({
        componentPath: componentPathStr,
        component,
        uid,
        message:
          "design.fields.transitionsOnEnter still has enabled/disabled strings (expected booleans).",
      });
    }

    if (carouselComponents.has(component)) {
      if (topLevelKeys.has("content")) {
        issues.push({
          componentPath: componentPathStr,
          component,
          uid,
          message: "Legacy content field still present (expected slides).",
        });
      }

      if (topLevelKeys.has("variant")) {
        issues.push({
          componentPath: componentPathStr,
          component,
          uid,
          message:
            "Legacy variant field still present (expected controls blok design).",
        });
      }

      if (topLevelKeys.has("previous_control_aria_label")) {
        issues.push({
          componentPath: componentPathStr,
          component,
          uid,
          message:
            "previous_control_aria_label still present at root (expected inside controls blok).",
        });
      }

      if (topLevelKeys.has("next_control_aria_label")) {
        issues.push({
          componentPath: componentPathStr,
          component,
          uid,
          message:
            "next_control_aria_label still present at root (expected inside controls blok).",
        });
      }

      if (observation) {
        for (const field of carouselForbiddenDesignFields) {
          if (observation.designFields.has(field)) {
            issues.push({
              componentPath: componentPathStr,
              component,
              uid,
              message: `Legacy design field still present: design.fields.${field}`,
            });
          }
        }
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
    console.log("No non-V3-to-V4 migration issues found.");
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
