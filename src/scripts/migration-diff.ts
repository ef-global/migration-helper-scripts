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

function usage(command = "bun run src/scripts/migration-diff.ts"): void {
  console.error(
    `Usage: ${command} <before.json> <after.json> [--out <html-file>] [--serve] [--port 4173]`,
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
      /* Initial loading overlay */
      .init-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        gap: 20px;
      }
      .init-loading .init-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--border);
        border-top-color: var(--text);
        border-radius: 50%;
        animation: init-spin 0.7s linear infinite;
      }
      @keyframes init-spin {
        to { transform: rotate(360deg); }
      }
      .init-loading .init-title {
        font-size: 18px;
        font-weight: 600;
      }
      .init-loading .init-status {
        font-size: 14px;
        color: var(--muted);
      }
      .init-loading .init-bar-track {
        width: 280px;
        height: 4px;
        background: var(--border);
        border-radius: 2px;
        overflow: hidden;
      }
      .init-loading .init-bar-fill {
        height: 100%;
        background: var(--text);
        border-radius: 2px;
        width: 0%;
        transition: width 0.2s ease;
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
      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 8px;
      }
      .section-header h2 { margin: 0; }
      .view-tabs {
        display: inline-flex;
        border: 1px solid var(--border);
        border-radius: 8px;
        overflow: hidden;
      }
      .view-tab {
        padding: 6px 14px;
        font-size: 13px;
        cursor: pointer;
        background: var(--bg);
        border: none;
        border-right: 1px solid var(--border);
        color: var(--text);
      }
      .view-tab:last-child { border-right: none; }
      .view-tab.active {
        background: var(--text);
        color: #fff;
        font-weight: 600;
      }
      .fj-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 0;
        flex-wrap: wrap;
      }
      .fj-toolbar button {
        padding: 4px 10px;
        font-size: 12px;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: #fff;
        cursor: pointer;
      }
      .fj-toolbar button:hover { background: var(--bg); }
      .fj-toolbar .fj-counter {
        font-size: 12px;
        color: var(--muted);
        min-width: 80px;
        text-align: center;
      }
      .fj-toolbar input[type="text"] {
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 12px;
        width: 180px;
      }
      .fj-filters {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 0 6px;
        flex-wrap: wrap;
        font-size: 12px;
      }
      .fj-filters-label {
        color: var(--muted);
        font-size: 11px;
        margin-right: 2px;
      }
      .fj-filter-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: #fff;
        cursor: pointer;
        font-size: 12px;
        user-select: none;
        transition: background 0.15s, border-color 0.15s;
      }
      .fj-filter-chip:hover { background: var(--bg); }
      .fj-filter-chip.active {
        background: var(--text);
        color: #fff;
        border-color: var(--text);
      }
      .fj-filter-chip .chip-x {
        font-size: 14px;
        font-weight: 600;
        opacity: 0.5;
        cursor: pointer;
        line-height: 1;
      }
      .fj-filter-chip .chip-x:hover { opacity: 1; }
      .fj-filter-custom {
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 3px 8px;
        font-size: 12px;
        width: 140px;
      }
      .fj-loading {
        padding: 12px 0;
        font-size: 13px;
        color: var(--muted);
      }
      .fj-progress-bar {
        height: 4px;
        background: var(--border);
        border-radius: 2px;
        margin-top: 6px;
        overflow: hidden;
      }
      .fj-progress-bar .fj-progress-fill {
        height: 100%;
        background: var(--text);
        border-radius: 2px;
        width: 0%;
        transition: width 0.15s ease;
      }
      .fj-container {
        border: 1px solid var(--border);
        border-radius: 8px;
        overflow: hidden;
      }
      .fj-header-row {
        display: grid;
        grid-template-columns: 52px 1fr 52px 1fr;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--muted);
        background: var(--bg);
        border-bottom: 1px solid var(--border);
        padding: 6px 0;
      }
      .fj-header-row span { padding: 0 8px; }
      .fj-scroll {
        max-height: 70vh;
        overflow: auto;
      }
      .fj-group {
        content-visibility: auto;
        contain-intrinsic-size: auto 2000px;
      }
      .fj-row {
        display: grid;
        grid-template-columns: 52px 1fr 52px 1fr;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        line-height: 1.45;
        border-bottom: 1px solid #f0f0ec;
      }
      .fj-row .fj-ln {
        padding: 1px 8px;
        text-align: right;
        color: var(--muted);
        background: #fafaf8;
        user-select: none;
        font-size: 11px;
      }
      .fj-row .fj-code {
        padding: 1px 8px;
        white-space: pre;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .fj-row.fj-delete .fj-code:nth-child(2) { background: #fff0f0; }
      .fj-row.fj-delete .fj-code:nth-child(4) { background: #fafaf8; }
      .fj-row.fj-insert .fj-code:nth-child(2) { background: #fafaf8; }
      .fj-row.fj-insert .fj-code:nth-child(4) { background: #eafbea; }
      .fj-row.fj-modify .fj-code:nth-child(2) { background: #fff0f0; }
      .fj-row.fj-modify .fj-code:nth-child(4) { background: #eafbea; }
      .fj-row.fj-current {
        outline: 2px solid #3b82f6;
        outline-offset: -2px;
        z-index: 1;
        position: relative;
      }
      .fj-search-hl {
        background: #fde68a;
        border-radius: 2px;
      }
      /* All Pages accordion styles */
      .ap-page {
        border: 1px solid var(--border);
        border-radius: 10px;
        margin-bottom: 8px;
        overflow: hidden;
      }
      .ap-page-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        cursor: pointer;
        background: #fbfbf8;
        border-bottom: 1px solid transparent;
        user-select: none;
      }
      .ap-page-header:hover { background: var(--bg); }
      .ap-page.ap-expanded .ap-page-header {
        border-bottom-color: var(--border);
      }
      .ap-chevron {
        font-size: 13px;
        transition: transform 0.15s ease;
        flex-shrink: 0;
      }
      .ap-expanded .ap-chevron { transform: rotate(90deg); }
      .ap-label {
        flex: 1;
        font-size: 13px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ap-badge {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 10px;
        background: #eee;
        color: var(--muted);
        flex-shrink: 0;
      }
      .ap-page-body {
        display: none;
        padding: 8px;
      }
      .ap-page.ap-expanded .ap-page-body { display: block; }
      .ap-page-body .fj-scroll { max-height: 50vh; }
      .ap-progress {
        padding: 8px 0;
        font-size: 13px;
        color: var(--muted);
      }
      @media (max-width: 900px) {
        .controls {
          grid-template-columns: 1fr;
        }
        .diff-values {
          grid-template-columns: 1fr;
        }
        .fj-row, .fj-header-row {
          grid-template-columns: 40px 1fr 40px 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div id="init-loading" class="init-loading">
      <div class="init-spinner"></div>
      <div class="init-title">Migration Diff Report</div>
      <div id="init-status" class="init-status">Parsing JSON data...</div>
      <div class="init-bar-track"><div id="init-bar-fill" class="init-bar-fill"></div></div>
    </div>

    <main class="page" style="display:none;" id="main-content">
      <section class="header">
        <h1>Migration Diff Report</h1>
        <div class="meta">Generated at <span id="generated-at"></span></div>
      </section>

      <section class="card">
        <h2>Summary</h2>
        <div id="summary"></div>
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
        <div class="section-header">
          <h2>Visual Diff</h2>
          <div class="view-tabs">
            <button id="tab-changes" class="view-tab active">Changes</button>
            <button id="tab-full-json" class="view-tab">Full Page JSON</button>
            <button id="tab-all-pages" class="view-tab">All Pages JSON</button>
          </div>
        </div>

        <div id="changes-view">
          <div class="control" style="margin-bottom: 10px;">
            <label for="diff-filter">Filter changed paths in selected page</label>
            <input id="diff-filter" type="text" placeholder="e.g. design.fields.text_color or sb-content-group" />
          </div>
          <div class="fj-filters" id="cv-filters">
            <span class="fj-filters-label">Hide changes:</span>
            <button class="fj-filter-chip" data-filter="component">.component</button>
            <button class="fj-filter-chip" data-filter="_uid">._uid</button>
            <button class="fj-filter-chip" data-filter="_editable">._editable</button>
            <input id="cv-custom-filter" class="fj-filter-custom" type="text" placeholder="Add filter + Enter" />
          </div>
          <div id="cv-visible-count" class="hint" style="margin-bottom: 6px;"></div>
          <div id="diff-meta" class="diff-meta"></div>
          <div id="diff-view"></div>
        </div>

        <div id="full-json-view" style="display:none;">
          <div class="fj-toolbar">
            <button id="fj-prev">Prev</button>
            <span id="fj-counter" class="fj-counter">0 / 0</span>
            <button id="fj-next">Next</button>
            <input id="fj-search" type="text" placeholder="Search in JSON..." />
          </div>
          <div class="fj-filters" id="fj-filters">
            <span class="fj-filters-label">Skip in nav:</span>
            <button class="fj-filter-chip" data-filter="component">"component"</button>
            <button class="fj-filter-chip" data-filter="_uid">"_uid"</button>
            <button class="fj-filter-chip" data-filter="_editable">"_editable"</button>
            <input id="fj-custom-filter" class="fj-filter-custom" type="text" placeholder="Add filter + Enter" />
          </div>
          <div id="fj-loading" class="fj-loading" style="display:none;">
            Rendering full JSON...
            <div class="fj-progress-bar"><div id="fj-progress-fill" class="fj-progress-fill"></div></div>
          </div>
          <div class="fj-container" style="display:none;" id="fj-container">
            <div class="fj-header-row">
              <span>Line</span><span>Before</span><span>Line</span><span>After</span>
            </div>
            <div class="fj-scroll" id="fj-scroll">
              <div id="fj-content"></div>
            </div>
          </div>
        </div>

        <div id="all-pages-view" style="display:none;">
          <div class="fj-toolbar">
            <button id="ap-expand-all">Expand All</button>
            <button id="ap-collapse-all">Collapse All</button>
            <button id="ap-prev">Prev</button>
            <span id="ap-counter" class="fj-counter">0 / 0</span>
            <button id="ap-next">Next</button>
            <input id="ap-search" type="text" placeholder="Search in all pages..." />
          </div>
          <div class="fj-filters" id="ap-filters">
            <span class="fj-filters-label">Skip in nav:</span>
            <button class="fj-filter-chip" data-filter="component">"component"</button>
            <button class="fj-filter-chip" data-filter="_uid">"_uid"</button>
            <button class="fj-filter-chip" data-filter="_editable">"_editable"</button>
            <input id="ap-custom-filter" class="fj-filter-custom" type="text" placeholder="Add filter + Enter" />
          </div>
          <div id="ap-loading" class="ap-progress" style="display:none;">
            Rendering pages...
            <div class="fj-progress-bar"><div id="ap-progress-fill" class="fj-progress-fill"></div></div>
          </div>
          <div id="ap-page-list"></div>
        </div>
      </section>

    </main>

    <script id="before-data" type="application/json">${beforeData}</script>
    <script id="after-data" type="application/json">${afterData}</script>
    <script>
      (function () {
        var initLoadingEl = document.getElementById("init-loading");
        var initStatusEl = document.getElementById("init-status");
        var initBarFill = document.getElementById("init-bar-fill");
        var mainContentEl = document.getElementById("main-content");

        function initProgress(pct, msg) {
          initBarFill.style.width = pct + "%";
          if (msg) initStatusEl.textContent = msg;
        }

        function finishLoading() {
          initLoadingEl.style.display = "none";
          mainContentEl.style.display = "";
        }

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

        function computeLineDiff(beforeLines, afterLines) {
          var rows = [];
          var bi = 0;
          var ai = 0;
          var LOOK = 40;

          while (bi < beforeLines.length || ai < afterLines.length) {
            if (bi >= beforeLines.length) {
              rows.push({ bNum: null, aNum: ai + 1, bLine: "", aLine: afterLines[ai], type: "insert" });
              ai++;
              continue;
            }
            if (ai >= afterLines.length) {
              rows.push({ bNum: bi + 1, aNum: null, bLine: beforeLines[bi], aLine: "", type: "delete" });
              bi++;
              continue;
            }
            if (beforeLines[bi] === afterLines[ai]) {
              rows.push({ bNum: bi + 1, aNum: ai + 1, bLine: beforeLines[bi], aLine: afterLines[ai], type: "same" });
              bi++;
              ai++;
              continue;
            }

            var foundB = -1;
            var foundA = -1;
            for (var look = 1; look <= LOOK; look++) {
              if (foundB === -1 && bi + look < beforeLines.length && beforeLines[bi + look] === afterLines[ai]) {
                foundB = look;
              }
              if (foundA === -1 && ai + look < afterLines.length && afterLines[ai + look] === beforeLines[bi]) {
                foundA = look;
              }
              if (foundB !== -1 || foundA !== -1) break;
            }

            if (foundB !== -1 && (foundA === -1 || foundB <= foundA)) {
              for (var d = 0; d < foundB; d++) {
                rows.push({ bNum: bi + 1, aNum: null, bLine: beforeLines[bi], aLine: "", type: "delete" });
                bi++;
              }
            } else if (foundA !== -1) {
              for (var ins = 0; ins < foundA; ins++) {
                rows.push({ bNum: null, aNum: ai + 1, bLine: "", aLine: afterLines[ai], type: "insert" });
                ai++;
              }
            } else {
              rows.push({ bNum: bi + 1, aNum: ai + 1, bLine: beforeLines[bi], aLine: afterLines[ai], type: "modify" });
              bi++;
              ai++;
            }
          }
          return rows;
        }

        setTimeout(function () {
        try {
          initProgress(10, "Parsing JSON data...");
          const before = JSON.parse(document.getElementById("before-data").textContent || "null");
          initProgress(30, "Parsing JSON data...");
          const after = JSON.parse(document.getElementById("after-data").textContent || "null");
          initProgress(50, "Parsing complete. Building page model...");
          document.getElementById("generated-at").textContent = new Date().toISOString();

          const beforeItems = normalizeItems(before);
          const afterItems = normalizeItems(after);

          if (beforeItems.length === 0 && afterItems.length === 0) {
            const changes = collectChanges(before, after, "");
            diffEl.replaceChildren(buildDiffDom(changes));
            pageMetaEl.textContent = "Detected non-array payload. Showing whole-object diff.";
            setSummary(1, changes.length > 0 ? 1 : 0, "Whole payload", changes.length);
            finishLoading();
            return;
          }

          initProgress(60, "Building page model...");
          const pages = buildPageModel(beforeItems, afterItems);
          const pagesByKey = new Map(pages.map((page) => [page.key, page]));
          initProgress(80, "Rendering initial view...");

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
            applyChangesViewFilters();
          }

          // --- Changes view filters ---
          var cvFiltersEl = document.getElementById("cv-filters");
          var cvCustomFilterEl = document.getElementById("cv-custom-filter");
          var cvVisibleCountEl = document.getElementById("cv-visible-count");
          var cvActiveFilters = new Set();

          renderPageOptions();
          renderSelectedPage();
          initProgress(100, "Ready");
          finishLoading();

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

          function applyChangesViewFilters() {
            var items = diffEl.querySelectorAll(".diff-item");
            if (items.length === 0) {
              cvVisibleCountEl.textContent = "";
              return;
            }
            if (!cvActiveFilters || cvActiveFilters.size === 0) {
              for (var i = 0; i < items.length; i++) {
                items[i].style.display = "";
              }
              cvVisibleCountEl.textContent = "";
              return;
            }
            var patterns = [];
            cvActiveFilters.forEach(function (f) { patterns.push(f.toLowerCase()); });
            var visible = 0;
            for (var i = 0; i < items.length; i++) {
              var pathEl = items[i].querySelector(".diff-path");
              var contextEl = items[i].querySelector(".diff-context");
              var text = ((pathEl ? pathEl.textContent : "") + " " + (contextEl ? contextEl.textContent : "")).toLowerCase();
              var matched = false;
              for (var p = 0; p < patterns.length; p++) {
                if (text.indexOf(patterns[p]) !== -1) { matched = true; break; }
              }
              items[i].style.display = matched ? "none" : "";
              if (!matched) visible++;
            }
            cvVisibleCountEl.textContent = "Showing " + visible + " of " + items.length + " changes";
          }

          // --- Full Page JSON view ---
          var tabChangesBtn = document.getElementById("tab-changes");
          var tabFullJsonBtn = document.getElementById("tab-full-json");
          var tabAllPagesBtn = document.getElementById("tab-all-pages");
          var changesViewEl = document.getElementById("changes-view");
          var fullJsonViewEl = document.getElementById("full-json-view");
          var allPagesViewEl = document.getElementById("all-pages-view");
          var fjLoadingEl = document.getElementById("fj-loading");
          var fjProgressFill = document.getElementById("fj-progress-fill");
          var fjContainerEl = document.getElementById("fj-container");
          var fjContentEl = document.getElementById("fj-content");
          var fjScrollEl = document.getElementById("fj-scroll");
          var fjCounterEl = document.getElementById("fj-counter");
          var fjSearchEl = document.getElementById("fj-search");
          var fjPrevBtn = document.getElementById("fj-prev");
          var fjNextBtn = document.getElementById("fj-next");

          // All Pages elements
          var apPageListEl = document.getElementById("ap-page-list");
          var apLoadingEl = document.getElementById("ap-loading");
          var apProgressFill = document.getElementById("ap-progress-fill");
          var apCounterEl = document.getElementById("ap-counter");
          var apSearchEl = document.getElementById("ap-search");
          var apPrevBtn = document.getElementById("ap-prev");
          var apNextBtn = document.getElementById("ap-next");
          var apExpandAllBtn = document.getElementById("ap-expand-all");
          var apCollapseAllBtn = document.getElementById("ap-collapse-all");

          var fjCurrentTab = "changes";
          var fjRenderedKey = null;
          var fjChangedRows = [];
          var fjCurrentIdx = -1;
          var fjSearchTimer = null;
          var ROWS_PER_GROUP = 100;
          var GROUPS_PER_FRAME = 20;
          var MAX_SEARCH_HL = 500;

          // All Pages state
          var apBuilt = false;
          var apRenderedPages = new Set();
          var apChangedRows = [];
          var apCurrentIdx = -1;
          var apSearchTimer = null;

          // Navigation skip-filters
          var fjFiltersEl = document.getElementById("fj-filters");
          var fjCustomFilterEl = document.getElementById("fj-custom-filter");
          var apFiltersEl = document.getElementById("ap-filters");
          var apCustomFilterEl = document.getElementById("ap-custom-filter");
          var fjActiveFilters = new Set();
          var apActiveFilters = new Set();

          function rowTextContent(rowEl) {
            var codes = rowEl.querySelectorAll(".fj-code");
            var text = "";
            for (var i = 0; i < codes.length; i++) {
              text += " " + (codes[i].textContent || "");
            }
            return text;
          }

          function rowMatchesFilter(rowEl, patterns) {
            if (patterns.length === 0) return false;
            var lower = rowTextContent(rowEl).toLowerCase();
            for (var p = 0; p < patterns.length; p++) {
              if (lower.indexOf(patterns[p].toLowerCase()) !== -1) return true;
            }
            return false;
          }

          // Get leading whitespace count from a row's code cells
          function rowIndent(rowEl) {
            var codes = rowEl.querySelectorAll(".fj-code");
            for (var i = 0; i < codes.length; i++) {
              var t = codes[i].textContent || "";
              if (t.trim()) {
                var m = t.match(/^(\\s*)/);
                return m ? m[1].length : 0;
              }
            }
            return 0;
          }

          // Check if a row looks like a JSON key line: "someKey": ...
          function isJsonKeyLine(rowEl) {
            var codes = rowEl.querySelectorAll(".fj-code");
            for (var i = 0; i < codes.length; i++) {
              var t = (codes[i].textContent || "").trim();
              if (t && /^"[^"]+"\s*:/.test(t)) return true;
            }
            return false;
          }

          // Group changed rows into contiguous DOM blocks, then further
          // split each block into logical sub-blocks using JSON indentation.
          // This way, sibling JSON properties like "text_align" and "text_color"
          // within the same contiguous run become separate filterable units.
          function groupIntoBlocks(changedRows) {
            if (changedRows.length === 0) return [];

            // Step 1: group into contiguous DOM runs
            var rawBlocks = [];
            var currentRaw = [changedRows[0]];

            for (var i = 1; i < changedRows.length; i++) {
              var prev = changedRows[i - 1];
              var curr = changedRows[i];

              var contiguous = false;
              var el = prev.nextElementSibling;
              while (el) {
                if (el === curr) { contiguous = true; break; }
                if (el.getAttribute && el.getAttribute("data-type") === "same") break;
                el = el.nextElementSibling;
              }
              if (!contiguous && !el) {
                var parentGroup = prev.parentElement;
                var nextGroup = parentGroup ? parentGroup.nextElementSibling : null;
                if (nextGroup) {
                  el = nextGroup.firstElementChild;
                  while (el) {
                    if (el === curr) { contiguous = true; break; }
                    if (el.getAttribute && el.getAttribute("data-type") === "same") break;
                    el = el.nextElementSibling;
                  }
                }
              }

              if (contiguous) {
                currentRaw.push(curr);
              } else {
                rawBlocks.push(currentRaw);
                currentRaw = [curr];
              }
            }
            rawBlocks.push(currentRaw);

            // Step 2: split each contiguous block into sub-blocks
            // at JSON property boundaries (same or lower indent + key line)
            var result = [];
            for (var b = 0; b < rawBlocks.length; b++) {
              var block = rawBlocks[b];
              if (block.length <= 1) {
                result.push(block);
                continue;
              }

              var baseIndent = rowIndent(block[0]);
              var sub = [block[0]];

              for (var j = 1; j < block.length; j++) {
                var ind = rowIndent(block[j]);
                if (ind <= baseIndent && isJsonKeyLine(block[j])) {
                  result.push(sub);
                  sub = [block[j]];
                  baseIndent = ind;
                } else {
                  sub.push(block[j]);
                }
              }
              result.push(sub);
            }

            return result;
          }

          function filterRows(allRows, filtersSet) {
            if (filtersSet.size === 0) return allRows;
            var patterns = [];
            filtersSet.forEach(function (f) { patterns.push(f); });

            var blocks = groupIntoBlocks(allRows);
            var result = [];
            for (var b = 0; b < blocks.length; b++) {
              var block = blocks[b];
              var blockMatches = false;
              for (var r = 0; r < block.length; r++) {
                if (rowMatchesFilter(block[r], patterns)) {
                  blockMatches = true;
                  break;
                }
              }
              if (!blockMatches) {
                for (var r2 = 0; r2 < block.length; r2++) {
                  result.push(block[r2]);
                }
              }
            }
            return result;
          }

          function setupFilterChips(containerEl, filtersSet, onChange) {
            var chips = containerEl.querySelectorAll(".fj-filter-chip");
            for (var i = 0; i < chips.length; i++) {
              (function (chip) {
                chip.addEventListener("click", function () {
                  var key = chip.getAttribute("data-filter");
                  if (filtersSet.has(key)) {
                    filtersSet.delete(key);
                    chip.classList.remove("active");
                  } else {
                    filtersSet.add(key);
                    chip.classList.add("active");
                  }
                  onChange();
                });
              })(chips[i]);
            }
          }

          function addCustomChip(containerEl, inputEl, filtersSet, onChange) {
            inputEl.addEventListener("keydown", function (e) {
              if (e.key !== "Enter") return;
              var val = inputEl.value.trim();
              if (!val) return;
              e.preventDefault();
              if (filtersSet.has(val)) {
                inputEl.value = "";
                return;
              }

              filtersSet.add(val);
              var chip = document.createElement("button");
              chip.className = "fj-filter-chip active";
              chip.setAttribute("data-filter", val);

              var label = document.createElement("span");
              label.textContent = val;
              chip.appendChild(label);

              var x = document.createElement("span");
              x.className = "chip-x";
              x.textContent = "\\u00d7";
              chip.appendChild(x);

              containerEl.insertBefore(chip, inputEl);
              inputEl.value = "";

              chip.addEventListener("click", function (ev) {
                // If clicking the X, remove entirely; otherwise toggle
                if (ev.target === x) {
                  filtersSet.delete(val);
                  chip.remove();
                  onChange();
                } else {
                  if (filtersSet.has(val)) {
                    filtersSet.delete(val);
                    chip.classList.remove("active");
                  } else {
                    filtersSet.add(val);
                    chip.classList.add("active");
                  }
                  onChange();
                }
              });

              onChange();
            });
          }

          function switchViewTab(tab) {
            fjCurrentTab = tab;
            changesViewEl.style.display = "none";
            fullJsonViewEl.style.display = "none";
            allPagesViewEl.style.display = "none";
            tabChangesBtn.classList.remove("active");
            tabFullJsonBtn.classList.remove("active");
            tabAllPagesBtn.classList.remove("active");

            if (tab === "changes") {
              changesViewEl.style.display = "";
              tabChangesBtn.classList.add("active");
            } else if (tab === "full-json") {
              fullJsonViewEl.style.display = "";
              tabFullJsonBtn.classList.add("active");
              var selectedKey = pageSelectEl.value;
              if (selectedKey && selectedKey !== fjRenderedKey) {
                renderFullJson(selectedKey);
              }
            } else if (tab === "all-pages") {
              allPagesViewEl.style.display = "";
              tabAllPagesBtn.classList.add("active");
              if (!apBuilt) {
                buildAllPagesList();
              }
            }
          }

          function escapeHtml(str) {
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          }

          function renderFullJson(pageKey) {
            var page = pagesByKey.get(pageKey);
            if (!page) return;

            fjRenderedKey = pageKey;
            fjChangedRows = [];
            fjCurrentIdx = -1;
            fjContentEl.innerHTML = "";
            fjContainerEl.style.display = "none";
            fjLoadingEl.style.display = "";
            fjProgressFill.style.width = "0%";
            fjCounterEl.textContent = "0 / 0";

            var beforeStr = JSON.stringify(page.beforeItem || null, null, 2) || "";
            var afterStr = JSON.stringify(page.afterItem || null, null, 2) || "";
            var bLines = beforeStr.split("\\n");
            var aLines = afterStr.split("\\n");
            var rows = computeLineDiff(bLines, aLines);

            var groups = [];
            for (var g = 0; g < rows.length; g += ROWS_PER_GROUP) {
              groups.push(rows.slice(g, g + ROWS_PER_GROUP));
            }

            var totalGroups = groups.length;
            var groupIdx = 0;
            var changedRowEls = [];

            function appendChunk() {
              var end = Math.min(groupIdx + GROUPS_PER_FRAME, totalGroups);
              for (; groupIdx < end; groupIdx++) {
                var group = groups[groupIdx];
                var groupEl = document.createElement("div");
                groupEl.className = "fj-group";
                var html = "";
                for (var r = 0; r < group.length; r++) {
                  var row = group[r];
                  var cls = "fj-row";
                  if (row.type !== "same") cls += " fj-" + row.type;
                  var bNum = row.bNum !== null ? row.bNum : "";
                  var aNum = row.aNum !== null ? row.aNum : "";
                  html += '<div class="' + cls + '" data-type="' + row.type + '">' +
                    '<span class="fj-ln">' + bNum + '</span>' +
                    '<span class="fj-code">' + escapeHtml(row.bLine) + '</span>' +
                    '<span class="fj-ln">' + aNum + '</span>' +
                    '<span class="fj-code">' + escapeHtml(row.aLine) + '</span>' +
                    '</div>';
                }
                groupEl.innerHTML = html;
                fjContentEl.appendChild(groupEl);

                var rowEls = groupEl.querySelectorAll(".fj-row");
                for (var ri = 0; ri < rowEls.length; ri++) {
                  if (rowEls[ri].getAttribute("data-type") !== "same") {
                    changedRowEls.push(rowEls[ri]);
                  }
                }
              }

              var pct = totalGroups > 0 ? Math.round((groupIdx / totalGroups) * 100) : 100;
              fjProgressFill.style.width = pct + "%";

              if (groupIdx < totalGroups) {
                requestAnimationFrame(appendChunk);
              } else {
                fjLoadingEl.style.display = "none";
                fjContainerEl.style.display = "";
                fjChangedRows = changedRowEls;
                fjCurrentIdx = -1;
                updateFjCounter();
              }
            }

            if (totalGroups > 0) {
              requestAnimationFrame(appendChunk);
            } else {
              fjLoadingEl.style.display = "none";
              fjContainerEl.style.display = "";
              fjCounterEl.textContent = "0 / 0";
            }
          }

          function getFjFilteredRows() {
            return filterRows(fjChangedRows, fjActiveFilters);
          }

          function updateFjCounter() {
            var filtered = getFjFilteredRows();
            if (fjCurrentIdx < 0 || fjCurrentIdx >= fjChangedRows.length) {
              fjCounterEl.textContent = "0 / " + filtered.length;
            } else {
              var posInFiltered = filtered.indexOf(fjChangedRows[fjCurrentIdx]);
              fjCounterEl.textContent = (posInFiltered >= 0 ? posInFiltered + 1 : 0) + " / " + filtered.length;
            }
          }

          function navigateChange(direction) {
            var filtered = getFjFilteredRows();
            if (filtered.length === 0) return;

            // Remove current highlight
            if (fjCurrentIdx >= 0 && fjCurrentIdx < fjChangedRows.length) {
              fjChangedRows[fjCurrentIdx].classList.remove("fj-current");
            }

            // Find current position in filtered list
            var currentFiltered = -1;
            if (fjCurrentIdx >= 0) {
              currentFiltered = filtered.indexOf(fjChangedRows[fjCurrentIdx]);
            }

            var nextFiltered;
            if (direction > 0) {
              nextFiltered = currentFiltered < filtered.length - 1 ? currentFiltered + 1 : 0;
            } else {
              nextFiltered = currentFiltered > 0 ? currentFiltered - 1 : filtered.length - 1;
            }

            var el = filtered[nextFiltered];
            fjCurrentIdx = fjChangedRows.indexOf(el);
            el.classList.add("fj-current");
            el.scrollIntoView({ block: "center", behavior: "smooth" });
            fjCounterEl.textContent = (nextFiltered + 1) + " / " + filtered.length;
          }

          function clearSearchHighlights() {
            var existing = fjContentEl.querySelectorAll(".fj-search-hl");
            for (var i = 0; i < existing.length; i++) {
              var parent = existing[i].parentNode;
              parent.replaceChild(document.createTextNode(existing[i].textContent), existing[i]);
              parent.normalize();
            }
          }

          function searchInFullJson(query) {
            clearSearchHighlights();
            if (!query || query.length < 2) return;

            var codes = fjContentEl.querySelectorAll(".fj-code");
            var count = 0;
            var lowerQuery = query.toLowerCase();
            var firstMatch = null;

            for (var i = 0; i < codes.length && count < MAX_SEARCH_HL; i++) {
              var text = codes[i].textContent || "";
              var lowerText = text.toLowerCase();
              if (lowerText.indexOf(lowerQuery) === -1) continue;

              var frag = document.createDocumentFragment();
              var pos = 0;
              var idx;
              while ((idx = lowerText.indexOf(lowerQuery, pos)) !== -1 && count < MAX_SEARCH_HL) {
                if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)));
                var mark = document.createElement("mark");
                mark.className = "fj-search-hl";
                mark.textContent = text.slice(idx, idx + query.length);
                frag.appendChild(mark);
                if (!firstMatch) firstMatch = mark;
                count++;
                pos = idx + query.length;
              }
              if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
              codes[i].textContent = "";
              codes[i].appendChild(frag);
            }

            if (firstMatch) {
              firstMatch.scrollIntoView({ block: "center", behavior: "smooth" });
            }
          }

          tabChangesBtn.addEventListener("click", function () { switchViewTab("changes"); });
          tabFullJsonBtn.addEventListener("click", function () { switchViewTab("full-json"); });
          tabAllPagesBtn.addEventListener("click", function () { switchViewTab("all-pages"); });
          fjPrevBtn.addEventListener("click", function () { navigateChange(-1); });
          fjNextBtn.addEventListener("click", function () { navigateChange(1); });

          fjSearchEl.addEventListener("input", function () {
            clearTimeout(fjSearchTimer);
            fjSearchTimer = setTimeout(function () {
              searchInFullJson(fjSearchEl.value.trim());
            }, 300);
          });

          pageSelectEl.addEventListener("change", function () {
            if (fjCurrentTab === "full-json") {
              fjRenderedKey = null;
              renderFullJson(pageSelectEl.value);
            }
          });

          // --- All Pages JSON view ---
          function getChangedPages() {
            return pages.filter(function (p) { return p.changed; });
          }

          function countPageChanges(page) {
            var beforeStr = JSON.stringify(page.beforeItem || null, null, 2) || "";
            var afterStr = JSON.stringify(page.afterItem || null, null, 2) || "";
            if (beforeStr === afterStr) return 0;
            var bLines = beforeStr.split("\\n");
            var aLines = afterStr.split("\\n");
            var rows = computeLineDiff(bLines, aLines);
            var count = 0;
            for (var i = 0; i < rows.length; i++) {
              if (rows[i].type !== "same") count++;
            }
            return count;
          }

          function buildAllPagesList() {
            apBuilt = true;
            apPageListEl.innerHTML = "";
            var changedPages = getChangedPages();

            if (changedPages.length === 0) {
              var empty = document.createElement("div");
              empty.className = "empty";
              empty.textContent = "No changed pages to display.";
              apPageListEl.appendChild(empty);
              return;
            }

            changedPages.forEach(function (page) {
              var pageEl = document.createElement("div");
              pageEl.className = "ap-page";
              pageEl.setAttribute("data-page-key", page.key);

              var header = document.createElement("div");
              header.className = "ap-page-header";

              var chevron = document.createElement("span");
              chevron.className = "ap-chevron";
              chevron.textContent = "\\u25b8";

              var label = document.createElement("span");
              label.className = "ap-label";
              label.textContent = page.label;
              label.title = page.label;

              var badge = document.createElement("span");
              badge.className = "ap-badge";
              var changeCount = countPageChanges(page);
              badge.textContent = changeCount + " change" + (changeCount !== 1 ? "s" : "");

              header.appendChild(chevron);
              header.appendChild(label);
              header.appendChild(badge);
              pageEl.appendChild(header);

              var body = document.createElement("div");
              body.className = "ap-page-body";
              pageEl.appendChild(body);

              header.addEventListener("click", function () {
                togglePage(pageEl, page.key);
              });

              apPageListEl.appendChild(pageEl);
            });
          }

          function togglePage(pageEl, pageKey) {
            var isExpanded = pageEl.classList.contains("ap-expanded");
            if (isExpanded) {
              pageEl.classList.remove("ap-expanded");
            } else {
              pageEl.classList.add("ap-expanded");
              if (!apRenderedPages.has(pageKey)) {
                renderPageBody(pageEl, pageKey);
              }
            }
            rebuildApChangedRows();
          }

          function renderPageBody(pageEl, pageKey) {
            var page = pagesByKey.get(pageKey);
            if (!page) return;
            apRenderedPages.add(pageKey);

            var body = pageEl.querySelector(".ap-page-body");
            body.innerHTML = "";

            var beforeStr = JSON.stringify(page.beforeItem || null, null, 2) || "";
            var afterStr = JSON.stringify(page.afterItem || null, null, 2) || "";
            var bLines = beforeStr.split("\\n");
            var aLines = afterStr.split("\\n");
            var rows = computeLineDiff(bLines, aLines);

            var container = document.createElement("div");
            container.className = "fj-container";

            var headerRow = document.createElement("div");
            headerRow.className = "fj-header-row";
            headerRow.innerHTML = "<span>Line</span><span>Before</span><span>Line</span><span>After</span>";
            container.appendChild(headerRow);

            var scroll = document.createElement("div");
            scroll.className = "fj-scroll";

            var groups = [];
            for (var g = 0; g < rows.length; g += ROWS_PER_GROUP) {
              groups.push(rows.slice(g, g + ROWS_PER_GROUP));
            }

            var totalGroups = groups.length;
            var groupIdx = 0;

            function appendPageChunk() {
              var end = Math.min(groupIdx + GROUPS_PER_FRAME, totalGroups);
              for (; groupIdx < end; groupIdx++) {
                var group = groups[groupIdx];
                var groupEl = document.createElement("div");
                groupEl.className = "fj-group";
                var html = "";
                for (var r = 0; r < group.length; r++) {
                  var row = group[r];
                  var cls = "fj-row";
                  if (row.type !== "same") cls += " fj-" + row.type;
                  var bNum = row.bNum !== null ? row.bNum : "";
                  var aNum = row.aNum !== null ? row.aNum : "";
                  html += '<div class="' + cls + '" data-type="' + row.type + '">' +
                    '<span class="fj-ln">' + bNum + '</span>' +
                    '<span class="fj-code">' + escapeHtml(row.bLine) + '</span>' +
                    '<span class="fj-ln">' + aNum + '</span>' +
                    '<span class="fj-code">' + escapeHtml(row.aLine) + '</span>' +
                    '</div>';
                }
                groupEl.innerHTML = html;
                scroll.appendChild(groupEl);
              }

              if (groupIdx < totalGroups) {
                requestAnimationFrame(appendPageChunk);
              } else {
                rebuildApChangedRows();
              }
            }

            container.appendChild(scroll);
            body.appendChild(container);

            if (totalGroups > 0) {
              requestAnimationFrame(appendPageChunk);
            }
          }

          function expandAllPages() {
            var pageEls = apPageListEl.querySelectorAll(".ap-page");
            if (pageEls.length === 0) return;

            apLoadingEl.style.display = "";
            apProgressFill.style.width = "0%";
            var idx = 0;
            var total = pageEls.length;

            function expandNext() {
              if (idx >= total) {
                apLoadingEl.style.display = "none";
                rebuildApChangedRows();
                return;
              }

              var pageEl = pageEls[idx];
              var pageKey = pageEl.getAttribute("data-page-key");
              pageEl.classList.add("ap-expanded");

              if (!apRenderedPages.has(pageKey)) {
                apRenderedPages.add(pageKey);
                var page = pagesByKey.get(pageKey);
                if (page) {
                  var body = pageEl.querySelector(".ap-page-body");
                  body.innerHTML = "";

                  var beforeStr = JSON.stringify(page.beforeItem || null, null, 2) || "";
                  var afterStr = JSON.stringify(page.afterItem || null, null, 2) || "";
                  var bLines = beforeStr.split("\\n");
                  var aLines = afterStr.split("\\n");
                  var rows = computeLineDiff(bLines, aLines);

                  var container = document.createElement("div");
                  container.className = "fj-container";
                  var headerRow = document.createElement("div");
                  headerRow.className = "fj-header-row";
                  headerRow.innerHTML = "<span>Line</span><span>Before</span><span>Line</span><span>After</span>";
                  container.appendChild(headerRow);

                  var scroll = document.createElement("div");
                  scroll.className = "fj-scroll";

                  var groups = [];
                  for (var g = 0; g < rows.length; g += ROWS_PER_GROUP) {
                    groups.push(rows.slice(g, g + ROWS_PER_GROUP));
                  }

                  var totalGroups = groups.length;
                  var groupI = 0;

                  function appendExpandChunk() {
                    var end = Math.min(groupI + GROUPS_PER_FRAME, totalGroups);
                    for (; groupI < end; groupI++) {
                      var group = groups[groupI];
                      var groupEl = document.createElement("div");
                      groupEl.className = "fj-group";
                      var html = "";
                      for (var r = 0; r < group.length; r++) {
                        var row = group[r];
                        var cls = "fj-row";
                        if (row.type !== "same") cls += " fj-" + row.type;
                        var bNum = row.bNum !== null ? row.bNum : "";
                        var aNum = row.aNum !== null ? row.aNum : "";
                        html += '<div class="' + cls + '" data-type="' + row.type + '">' +
                          '<span class="fj-ln">' + bNum + '</span>' +
                          '<span class="fj-code">' + escapeHtml(row.bLine) + '</span>' +
                          '<span class="fj-ln">' + aNum + '</span>' +
                          '<span class="fj-code">' + escapeHtml(row.aLine) + '</span>' +
                          '</div>';
                      }
                      groupEl.innerHTML = html;
                      scroll.appendChild(groupEl);
                    }

                    if (groupI < totalGroups) {
                      requestAnimationFrame(appendExpandChunk);
                    } else {
                      idx++;
                      var pct = Math.round((idx / total) * 100);
                      apProgressFill.style.width = pct + "%";
                      requestAnimationFrame(expandNext);
                    }
                  }

                  container.appendChild(scroll);
                  body.appendChild(container);
                  if (totalGroups > 0) {
                    requestAnimationFrame(appendExpandChunk);
                  } else {
                    idx++;
                    var pct = Math.round((idx / total) * 100);
                    apProgressFill.style.width = pct + "%";
                    requestAnimationFrame(expandNext);
                  }
                  return;
                }
              }

              idx++;
              var pct = Math.round((idx / total) * 100);
              apProgressFill.style.width = pct + "%";
              requestAnimationFrame(expandNext);
            }

            requestAnimationFrame(expandNext);
          }

          function collapseAllPages() {
            var pageEls = apPageListEl.querySelectorAll(".ap-page.ap-expanded");
            for (var i = 0; i < pageEls.length; i++) {
              pageEls[i].classList.remove("ap-expanded");
            }
            apChangedRows = [];
            apCurrentIdx = -1;
            apCounterEl.textContent = "0 / 0";
          }

          function getApFilteredRows() {
            return filterRows(apChangedRows, apActiveFilters);
          }

          function updateApCounter() {
            var filtered = getApFilteredRows();
            if (apCurrentIdx < 0 || apCurrentIdx >= apChangedRows.length) {
              apCounterEl.textContent = "0 / " + filtered.length;
            } else {
              var posInFiltered = filtered.indexOf(apChangedRows[apCurrentIdx]);
              apCounterEl.textContent = (posInFiltered >= 0 ? posInFiltered + 1 : 0) + " / " + filtered.length;
            }
          }

          function rebuildApChangedRows() {
            var rows = apPageListEl.querySelectorAll(".ap-page.ap-expanded .fj-row[data-type]");
            apChangedRows = [];
            for (var i = 0; i < rows.length; i++) {
              if (rows[i].getAttribute("data-type") !== "same") {
                apChangedRows.push(rows[i]);
              }
            }
            apCurrentIdx = -1;
            updateApCounter();
          }

          function navigateApChange(direction) {
            var filtered = getApFilteredRows();
            if (filtered.length === 0) return;

            if (apCurrentIdx >= 0 && apCurrentIdx < apChangedRows.length) {
              apChangedRows[apCurrentIdx].classList.remove("fj-current");
            }

            var currentFiltered = -1;
            if (apCurrentIdx >= 0) {
              currentFiltered = filtered.indexOf(apChangedRows[apCurrentIdx]);
            }

            var nextFiltered;
            if (direction > 0) {
              nextFiltered = currentFiltered < filtered.length - 1 ? currentFiltered + 1 : 0;
            } else {
              nextFiltered = currentFiltered > 0 ? currentFiltered - 1 : filtered.length - 1;
            }

            var el = filtered[nextFiltered];
            apCurrentIdx = apChangedRows.indexOf(el);
            el.classList.add("fj-current");
            el.scrollIntoView({ block: "center", behavior: "smooth" });
            apCounterEl.textContent = (nextFiltered + 1) + " / " + filtered.length;
          }

          function clearApSearchHighlights() {
            var existing = apPageListEl.querySelectorAll(".fj-search-hl");
            for (var i = 0; i < existing.length; i++) {
              var parent = existing[i].parentNode;
              parent.replaceChild(document.createTextNode(existing[i].textContent), existing[i]);
              parent.normalize();
            }
          }

          function searchInAllPages(query) {
            clearApSearchHighlights();
            if (!query || query.length < 2) return;

            var codes = apPageListEl.querySelectorAll(".ap-page.ap-expanded .fj-code");
            var count = 0;
            var lowerQuery = query.toLowerCase();
            var firstMatch = null;

            for (var i = 0; i < codes.length && count < MAX_SEARCH_HL; i++) {
              var text = codes[i].textContent || "";
              var lowerText = text.toLowerCase();
              if (lowerText.indexOf(lowerQuery) === -1) continue;

              var frag = document.createDocumentFragment();
              var pos = 0;
              var matchIdx;
              while ((matchIdx = lowerText.indexOf(lowerQuery, pos)) !== -1 && count < MAX_SEARCH_HL) {
                if (matchIdx > pos) frag.appendChild(document.createTextNode(text.slice(pos, matchIdx)));
                var mark = document.createElement("mark");
                mark.className = "fj-search-hl";
                mark.textContent = text.slice(matchIdx, matchIdx + query.length);
                frag.appendChild(mark);
                if (!firstMatch) firstMatch = mark;
                count++;
                pos = matchIdx + query.length;
              }
              if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
              codes[i].textContent = "";
              codes[i].appendChild(frag);
            }

            if (firstMatch) {
              firstMatch.scrollIntoView({ block: "center", behavior: "smooth" });
            }
          }

          apExpandAllBtn.addEventListener("click", function () { expandAllPages(); });
          apCollapseAllBtn.addEventListener("click", function () { collapseAllPages(); });
          apPrevBtn.addEventListener("click", function () { navigateApChange(-1); });
          apNextBtn.addEventListener("click", function () { navigateApChange(1); });
          apSearchEl.addEventListener("input", function () {
            clearTimeout(apSearchTimer);
            apSearchTimer = setTimeout(function () {
              searchInAllPages(apSearchEl.value.trim());
            }, 300);
          });

          // Wire up skip-filter chips and custom inputs
          function resetFjNav() {
            var prev = fjCurrentIdx >= 0 && fjCurrentIdx < fjChangedRows.length ? fjChangedRows[fjCurrentIdx] : null;
            if (prev) prev.classList.remove("fj-current");
            fjCurrentIdx = -1;
            updateFjCounter();
          }
          function resetApNav() {
            var prev = apCurrentIdx >= 0 && apCurrentIdx < apChangedRows.length ? apChangedRows[apCurrentIdx] : null;
            if (prev) prev.classList.remove("fj-current");
            apCurrentIdx = -1;
            updateApCounter();
          }

          setupFilterChips(cvFiltersEl, cvActiveFilters, applyChangesViewFilters);
          setupFilterChips(fjFiltersEl, fjActiveFilters, resetFjNav);
          setupFilterChips(apFiltersEl, apActiveFilters, resetApNav);
          addCustomChip(cvFiltersEl, cvCustomFilterEl, cvActiveFilters, applyChangesViewFilters);
          addCustomChip(fjFiltersEl, fjCustomFilterEl, fjActiveFilters, resetFjNav);
          addCustomChip(apFiltersEl, apCustomFilterEl, apActiveFilters, resetApNav);

        } catch (error) {
          finishLoading();
          summaryEl.textContent = "Failed to render diff.";
          diffEl.textContent =
            error && error.message
              ? "Error: " + error.message
              : "Unknown error while rendering diff.";
        }
        }, 0);
      })();
    </script>
  </body>
</html>`;
}

export async function runMigrationDiff(
  args: string[] = process.argv.slice(2),
  command = "bun run src/scripts/migration-diff.ts",
): Promise<number> {
  let parsed;

  try {
    parsed = parseArgs(args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    usage(command);
    return 1;
  }

  if (!parsed.beforePath || !parsed.afterPath) {
    usage(command);
    return 1;
  }

  try {
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
      return 0;
    }

    const parent = dirname(outPath);
    console.log(`Open this file in your browser: ${outPath}`);
    console.log(`Or serve directory: ${parent}`);
    return 0;
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    return 1;
  }
}

if (import.meta.main) {
  runMigrationDiff().then((exitCode) => {
    process.exit(exitCode);
  });
}
