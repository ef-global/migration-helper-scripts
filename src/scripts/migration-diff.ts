#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

function parseArgs(args: string[]): {
  beforePath: string | null;
  afterPath: string | null;
  outPath: string;
  serve: boolean;
  port: number;
} {
  let beforePath: string | null = null;
  let afterPath: string | null = null;
  let outPath = "./migration-diff-report.html";
  let serve = false;
  let port = 4173;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--serve") {
      serve = true;
      continue;
    }

    if (arg.startsWith("--out=")) {
      outPath = arg.slice("--out=".length);
      continue;
    }

    if (arg === "--out") {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --out.");
      }
      outPath = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--port=")) {
      const value = Number(arg.slice("--port=".length));
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("--port must be a positive number.");
      }
      port = value;
      continue;
    }

    if (arg === "--port") {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --port.");
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--port must be a positive number.");
      }
      port = parsed;
      i += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}`);
    }

    if (!beforePath) {
      beforePath = arg;
    } else if (!afterPath) {
      afterPath = arg;
    } else {
      throw new Error("Expected exactly two positional paths: <before> <after>");
    }
  }

  return {
    beforePath,
    afterPath,
    outPath,
    serve,
    port,
  };
}

function usage(): void {
  console.error(
    "Usage: bun run src/scripts/migration-diff.ts <before.json> <after.json> [--out <html-file>] [--serve] [--port 4173]",
  );
}

function toSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function createHtml({
  beforeJson,
  afterJson,
}: {
  beforeJson: unknown;
  afterJson: unknown;
}): string {
  const beforeData = toSafeJson(beforeJson);
  const afterData = toSafeJson(afterJson);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Migration Diff Report</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/jsondiffpatch@0.6.0/public/formatters-styles/html.css" />
    <style>
      :root {
        --bg: #f7f7f5;
        --card: #ffffff;
        --text: #111111;
        --muted: #666666;
        --border: #deded8;
      }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
        background: var(--bg);
        color: var(--text);
      }
      .page {
        max-width: 1200px;
        margin: 0 auto;
        padding: 24px;
      }
      .header {
        margin-bottom: 16px;
      }
      .meta {
        color: var(--muted);
        font-size: 14px;
      }
      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 16px;
        overflow: hidden;
      }
      .controls {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .control {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .control label {
        font-size: 12px;
        color: var(--muted);
      }
      .control input[type="text"],
      .control select {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 14px;
      }
      .toggle {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        margin-top: 8px;
      }
      .meta-list {
        margin: 0;
        padding-left: 18px;
      }
      .meta-list li {
        margin: 2px 0;
      }
      .diff-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .diff-item {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px;
        background: #fbfbf8;
      }
      .diff-path {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        color: #2a2a2a;
        margin-bottom: 8px;
        overflow-wrap: anywhere;
      }
      .diff-context {
        font-size: 12px;
        color: #4f5f53;
        margin-bottom: 8px;
        overflow-wrap: anywhere;
      }
      .diff-values {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .value-box {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px;
        background: #fff;
      }
      .value-box.before {
        border-color: #e6b7b7;
        background: #fff6f6;
      }
      .value-box.after {
        border-color: #b8dfbe;
        background: #f3fff4;
      }
      .value-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--muted);
        margin-bottom: 6px;
      }
      pre {
        margin: 0;
        overflow: auto;
        max-height: 420px;
        font-size: 12px;
        line-height: 1.4;
      }
      h1, h2, h3 {
        margin: 0 0 8px;
      }
      .hint {
        color: var(--muted);
        font-size: 13px;
      }
      .diff-meta {
        color: var(--muted);
        font-size: 12px;
        margin-bottom: 10px;
        overflow-wrap: anywhere;
      }
      .empty {
        border: 1px dashed var(--border);
        border-radius: 8px;
        padding: 12px;
        color: var(--muted);
      }
      @media (max-width: 900px) {
        .controls {
          grid-template-columns: 1fr;
        }
        .diff-values {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="header">
        <h1>Migration Diff Report</h1>
        <div class="meta">Generated at <span id="generated-at"></span></div>
      </section>

      <section class="card">
        <h2>Summary</h2>
        <div id="summary">Computing diff...</div>
      </section>

      <section class="card">
        <h2>Page Navigator</h2>
        <div class="controls">
          <div class="control">
            <label for="page-filter">Filter pages</label>
            <input id="page-filter" type="text" placeholder="slug, name, id..." />
          </div>
          <div class="control">
            <label for="page-select">Select page</label>
            <select id="page-select"></select>
          </div>
        </div>
        <label class="toggle">
          <input id="show-changed-only" type="checkbox" checked />
          Show changed pages only
        </label>
        <div id="page-meta" class="hint" style="margin-top: 10px;"></div>
      </section>

      <section class="card">
        <h2>Visual Diff</h2>
        <div class="control" style="margin-bottom: 10px;">
          <label for="diff-filter">Filter changed paths in selected page</label>
          <input id="diff-filter" type="text" placeholder="e.g. design.fields.text_color or sb-content-group" />
        </div>
        <div id="diff-meta" class="diff-meta"></div>
        <div id="diff-view"></div>
      </section>

    </main>

    <script id="before-data" type="application/json">${beforeData}</script>
    <script id="after-data" type="application/json">${afterData}</script>
    <script>
      (function () {
        const summaryEl = document.getElementById("summary");
        const diffEl = document.getElementById("diff-view");
        const pageSelectEl = document.getElementById("page-select");
        const pageFilterEl = document.getElementById("page-filter");
        const diffFilterEl = document.getElementById("diff-filter");
        const changedOnlyEl = document.getElementById("show-changed-only");
        const pageMetaEl = document.getElementById("page-meta");
        const diffMetaEl = document.getElementById("diff-meta");
        const MAX_VALUE_CHARS = 2500;
        const MAX_RENDERED_CHANGES = 1200;

        function isObject(value) {
          return value !== null && typeof value === "object" && !Array.isArray(value);
        }

        function safeStringify(value) {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        }

        function valueToDisplay(value) {
          if (typeof value === "undefined") return "undefined";
          const pretty = JSON.stringify(value, null, 2);
          if (typeof pretty === "undefined") return String(value);
          if (pretty.length <= MAX_VALUE_CHARS) return pretty;
          return (
            pretty.slice(0, MAX_VALUE_CHARS) +
            "\\n... truncated (" +
            (pretty.length - MAX_VALUE_CHARS) +
            " chars hidden) ..."
          );
        }

        function formatPathSegment(path, key) {
          if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
            return path ? path + "." + key : key;
          }
          return path + "[\\"" + key + "\\"]";
        }

        function formatPathFromSegments(segments) {
          if (!Array.isArray(segments) || segments.length === 0) {
            return "(root)";
          }

          let path = "";
          segments.forEach((segment) => {
            if (typeof segment === "number") {
              path += "[" + segment + "]";
              return;
            }

            if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(segment)) {
              path += path ? "." + segment : segment;
              return;
            }

            path += "[\\"" + String(segment) + "\\"]";
          });

          return path || "(root)";
        }

        function parsePathSegments(path) {
          if (!path || path === "(root)") {
            return [];
          }

          const segments = [];
          let i = 0;

          while (i < path.length) {
            const char = path[i];

            if (char === ".") {
              i += 1;
              continue;
            }

            if (char === "[") {
              const nextChar = path[i + 1];

              if (nextChar === '"') {
                let j = i + 2;
                let key = "";
                while (j < path.length) {
                  const c = path[j];
                  if (c === '"') {
                    break;
                  }
                  key += c;
                  j += 1;
                }
                segments.push(key);
                i = path.indexOf("]", j);
                if (i === -1) break;
                i += 1;
                continue;
              }

              let j = i + 1;
              let num = "";
              while (j < path.length && path[j] !== "]") {
                num += path[j];
                j += 1;
              }

              if (num.length > 0 && /^-?\\d+$/.test(num)) {
                segments.push(Number(num));
              } else {
                segments.push(num);
              }

              i = j + 1;
              continue;
            }

            let j = i;
            let key = "";
            while (j < path.length && path[j] !== "." && path[j] !== "[") {
              key += path[j];
              j += 1;
            }
            if (key.length > 0) {
              segments.push(key);
            }
            i = j;
          }

          return segments;
        }

        function getValueAtSegments(root, segments) {
          let current = root;

          for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            if (current === null || typeof current === "undefined") {
              return undefined;
            }
            current = current[segment];
          }

          return current;
        }

        function findNearestComponentContext(root, path) {
          const segments = parsePathSegments(path);

          for (let i = segments.length; i >= 0; i--) {
            const candidateSegments = segments.slice(0, i);
            const node = getValueAtSegments(root, candidateSegments);

            if (!isObject(node) || typeof node.component !== "string") {
              continue;
            }

            return {
              component: node.component,
              uid: typeof node._uid === "string" ? node._uid : null,
              componentPath: formatPathFromSegments(candidateSegments),
            };
          }

          return null;
        }

        function collectChanges(beforeValue, afterValue, path) {
          const currentPath = path || "";
          const beforeSerialized = safeStringify(beforeValue);
          const afterSerialized = safeStringify(afterValue);

          if (beforeSerialized === afterSerialized) {
            return [];
          }

          if (Array.isArray(beforeValue) && Array.isArray(afterValue)) {
            const max = Math.max(beforeValue.length, afterValue.length);
            const changes = [];
            for (let i = 0; i < max; i++) {
              const childPath = currentPath ? currentPath + "[" + i + "]" : "[" + i + "]";
              changes.push(...collectChanges(beforeValue[i], afterValue[i], childPath));
            }
            return changes;
          }

          if (isObject(beforeValue) && isObject(afterValue)) {
            const keys = new Set([
              ...Object.keys(beforeValue),
              ...Object.keys(afterValue),
            ]);
            const changes = [];

            keys.forEach((key) => {
              const childPath = formatPathSegment(currentPath, key);
              changes.push(...collectChanges(beforeValue[key], afterValue[key], childPath));
            });

            return changes;
          }

          return [
            {
              path: currentPath || "(root)",
              before: beforeValue,
              after: afterValue,
            },
          ];
        }

        function normalizeItems(value) {
          if (Array.isArray(value)) return value;
          if (isObject(value) && Array.isArray(value.items)) return value.items;
          return [];
        }

        function getStory(item) {
          if (!isObject(item)) return null;
          return isObject(item.story) ? item.story : null;
        }

        function getPageKey(item, index) {
          const story = getStory(item);
          if (!story) return "index:" + index;
          return String(
            story.uuid || story.id || story.full_slug || story.slug || ("index:" + index),
          );
        }

        function getPageLabel(item, key) {
          const story = getStory(item);
          if (!story) return key;
          const slug = story.full_slug || story.slug || "";
          const name = story.name || "";
          const id = story.id || story.uuid || "";

          const head = slug || name || key;
          const tail = id && String(id) !== key ? " (id: " + id + ")" : "";
          return head + tail;
        }

        function toSearchText(page) {
          const parts = [page.key, page.label, page.slug || "", page.name || "", page.id || ""];
          return parts.join(" ").toLowerCase();
        }

        function buildPageModel(beforeItems, afterItems) {
          const beforeByKey = new Map();
          const afterByKey = new Map();

          beforeItems.forEach((item, index) => {
            const key = getPageKey(item, index);
            if (!beforeByKey.has(key)) beforeByKey.set(key, item);
          });

          afterItems.forEach((item, index) => {
            const key = getPageKey(item, index);
            if (!afterByKey.has(key)) afterByKey.set(key, item);
          });

          const orderedKeys = [];
          beforeByKey.forEach((_, key) => orderedKeys.push(key));
          afterByKey.forEach((_, key) => {
            if (!beforeByKey.has(key)) orderedKeys.push(key);
          });

          return orderedKeys.map((key) => {
            const beforeItem = beforeByKey.get(key);
            const afterItem = afterByKey.get(key);
            const baseItem = afterItem || beforeItem || {};
            const story = getStory(baseItem) || {};
            const label = getPageLabel(baseItem, key);
            const changed = safeStringify(beforeItem) !== safeStringify(afterItem);

            return {
              key,
              label,
              story,
              beforeItem,
              afterItem,
              changed,
              slug: story.full_slug || story.slug || "",
              name: story.name || "",
              id: story.id || story.uuid || "",
            };
          });
        }

        function buildDiffDom(changes) {
          if (changes.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "No differences found for the selected page.";
            return empty;
          }

          const wrapper = document.createElement("div");
          wrapper.className = "diff-list";

          const shown = changes.slice(0, MAX_RENDERED_CHANGES);

          shown.forEach((change, index) => {
            const item = document.createElement("div");
            item.className = "diff-item";

            const path = document.createElement("div");
            path.className = "diff-path";
            path.textContent = "#" + (index + 1) + " " + change.path;

            const context = document.createElement("div");
            context.className = "diff-context";
            if (change.context && change.context.component) {
              const uidPart = change.context.uid ? " | _uid: " + change.context.uid : "";
              context.textContent =
                "component: " +
                change.context.component +
                uidPart +
                " | at: " +
                change.context.componentPath;
            } else {
              context.textContent = "component: (not resolved)";
            }

            const values = document.createElement("div");
            values.className = "diff-values";

            const beforeBox = document.createElement("div");
            beforeBox.className = "value-box before";
            const beforeTitle = document.createElement("div");
            beforeTitle.className = "value-title";
            beforeTitle.textContent = "Before";
            const beforePre = document.createElement("pre");
            beforePre.textContent = valueToDisplay(change.before);
            beforeBox.append(beforeTitle, beforePre);

            const afterBox = document.createElement("div");
            afterBox.className = "value-box after";
            const afterTitle = document.createElement("div");
            afterTitle.className = "value-title";
            afterTitle.textContent = "After";
            const afterPre = document.createElement("pre");
            afterPre.textContent = valueToDisplay(change.after);
            afterBox.append(afterTitle, afterPre);

            values.append(beforeBox, afterBox);
            item.append(path, context, values);
            wrapper.append(item);
          });

          if (changes.length > shown.length) {
            const notice = document.createElement("div");
            notice.className = "empty";
            notice.textContent =
              "Showing first " +
              shown.length +
              " changes out of " +
              changes.length +
              ". Use filter to narrow down.";
            wrapper.prepend(notice);
          }

          return wrapper;
        }

        function setSummary(totalPages, changedPages, selectedLabel, selectedChanges) {
          summaryEl.textContent =
            "Pages: " +
            totalPages +
            ". Changed pages: " +
            changedPages +
            ". Selected: " +
            selectedLabel +
            ". Changes in selected page: " +
            selectedChanges +
            ".";
        }

        function hashChanges(changes) {
          let hash = 2166136261;
          const input = changes
            .map((change) => {
              const component = change.context?.component || "";
              const uid = change.context?.uid || "";
              return change.path + "|" + component + "|" + uid;
            })
            .join("||");

          for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash +=
              (hash << 1) +
              (hash << 4) +
              (hash << 7) +
              (hash << 8) +
              (hash << 24);
          }

          return (hash >>> 0).toString(16);
        }

        function buildComponentBreakdown(changes) {
          const counts = new Map();
          changes.forEach((change) => {
            const component = change.context?.component || "(unknown)";
            counts.set(component, (counts.get(component) || 0) + 1);
          });

          return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([component, count]) => component + ": " + count)
            .join(", ");
        }

        try {
          const before = JSON.parse(document.getElementById("before-data").textContent || "null");
          const after = JSON.parse(document.getElementById("after-data").textContent || "null");
          document.getElementById("generated-at").textContent = new Date().toISOString();

          const beforeItems = normalizeItems(before);
          const afterItems = normalizeItems(after);

          if (beforeItems.length === 0 && afterItems.length === 0) {
            const changes = collectChanges(before, after, "");
            diffEl.replaceChildren(buildDiffDom(changes));
            pageMetaEl.textContent = "Detected non-array payload. Showing whole-object diff.";
            setSummary(1, changes.length > 0 ? 1 : 0, "Whole payload", changes.length);
            return;
          }

          const pages = buildPageModel(beforeItems, afterItems);
          const pagesByKey = new Map(pages.map((page) => [page.key, page]));

          function filteredPages() {
            const search = (pageFilterEl.value || "").trim().toLowerCase();
            const changedOnly = changedOnlyEl.checked;
            return pages.filter((page) => {
              if (changedOnly && !page.changed) return false;
              if (!search) return true;
              return toSearchText(page).includes(search);
            });
          }

          function renderPageOptions() {
            const currentValue = pageSelectEl.value;
            const candidates = filteredPages();
            pageSelectEl.innerHTML = "";

            if (candidates.length === 0) {
              const option = document.createElement("option");
              option.value = "";
              option.textContent = "No pages match current filters";
              pageSelectEl.append(option);
              return candidates;
            }

            candidates.forEach((page) => {
              const option = document.createElement("option");
              option.value = page.key;
              option.textContent = (page.changed ? "● " : "○ ") + page.label;
              pageSelectEl.append(option);
            });

            const canKeepCurrent = candidates.some((page) => page.key === currentValue);
            pageSelectEl.value = canKeepCurrent ? currentValue : candidates[0].key;

            return candidates;
          }

          function renderSelectedPage() {
            const selectedKey = pageSelectEl.value;
            const page = pagesByKey.get(selectedKey);

            if (!page) {
              diffEl.innerHTML = '<div class="empty">No page selected.</div>';
              pageMetaEl.textContent = "";
              return;
            }

            const pathFilter = (diffFilterEl.value || "").trim().toLowerCase();
            let changes = collectChanges(page.beforeItem, page.afterItem, "");
            changes = changes.map((change) => {
              const afterContext = findNearestComponentContext(
                page.afterItem,
                change.path,
              );
              const beforeContext = findNearestComponentContext(
                page.beforeItem,
                change.path,
              );

              return {
                path: change.path,
                before: change.before,
                after: change.after,
                context: afterContext || beforeContext,
              };
            });

            if (pathFilter) {
              changes = changes.filter((change) =>
                String(change.path).toLowerCase().includes(pathFilter) ||
                String(change.context?.component || "")
                  .toLowerCase()
                  .includes(pathFilter) ||
                String(change.context?.componentPath || "")
                  .toLowerCase()
                  .includes(pathFilter),
              );
            }

            diffEl.replaceChildren(buildDiffDom(changes));

            const metaParts = [
              page.slug ? "slug: " + page.slug : null,
              page.name ? "name: " + page.name : null,
              page.id ? "id: " + page.id : null,
              "status: " + (page.changed ? "changed" : "unchanged"),
            ].filter(Boolean);

            pageMetaEl.textContent = metaParts.join(" | ");
            diffMetaEl.textContent =
              "page-key: " +
              page.key +
              " | diff-signature: " +
              hashChanges(changes) +
              " | top components: " +
              (buildComponentBreakdown(changes) || "(none)");
            setSummary(
              pages.length,
              pages.filter((candidate) => candidate.changed).length,
              page.label,
              changes.length,
            );
          }

          renderPageOptions();
          renderSelectedPage();

          pageSelectEl.addEventListener("change", renderSelectedPage);
          diffFilterEl.addEventListener("input", renderSelectedPage);
          pageFilterEl.addEventListener("input", function () {
            renderPageOptions();
            renderSelectedPage();
          });
          changedOnlyEl.addEventListener("change", function () {
            renderPageOptions();
            renderSelectedPage();
          });
        } catch (error) {
          summaryEl.textContent = "Failed to render diff.";
          diffEl.textContent =
            error && error.message
              ? "Error: " + error.message
              : "Unknown error while rendering diff.";
        }
      })();
    </script>
  </body>
</html>`;
}

async function main(): Promise<void> {
  let parsed;

  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    usage();
    process.exit(1);
    return;
  }

  if (!parsed.beforePath || !parsed.afterPath) {
    usage();
    process.exit(1);
  }

  const beforePath = resolve(parsed.beforePath);
  const afterPath = resolve(parsed.afterPath);
  const outPath = resolve(parsed.outPath);

  if (!existsSync(beforePath)) {
    throw new Error(`Before file not found: ${beforePath}`);
  }

  if (!existsSync(afterPath)) {
    throw new Error(`After file not found: ${afterPath}`);
  }

  const beforeJson = await Bun.file(beforePath).json();
  const afterJson = await Bun.file(afterPath).json();

  const html = createHtml({
    beforeJson,
    afterJson,
  });

  await Bun.write(outPath, html);
  console.log(`Diff report written: ${outPath}`);

  if (parsed.serve) {
    const reportHtml = await Bun.file(outPath).text();

    Bun.serve({
      port: parsed.port,
      fetch: () =>
        new Response(reportHtml, {
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        }),
    });

    console.log(`Serving diff report at http://localhost:${parsed.port}`);
    console.log("Press Ctrl+C to stop.");

    // Keep process alive.
    await new Promise(() => undefined);
  } else {
    const parent = dirname(outPath);
    console.log(`Open this file in your browser: ${outPath}`);
    console.log(`Or serve directory: ${parent}`);
  }
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
