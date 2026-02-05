# Migration Validation Scripts — First Script Plan

## Project Setup

**Runtime:** Bun (faster JSON.parse, faster file I/O, faster startup than Node.js)
**Language:** TypeScript
**Streaming fallback:** `stream-json` npm package (for files too large for memory)

### Files to create:

1. **`tsconfig.json`** — TypeScript config for Bun
2. **`package.json`** — Update existing with Bun scripts, add `stream-json` dependency
3. **`.gitignore`** — Standard node gitignore
4. **`src/utils/traverse.ts`** — Core recursive JSON traversal utility (reusable by all future scripts)
5. **`src/utils/stream-traverse.ts`** — Streaming variant using `stream-json` for huge files (auto-fallback)
6. **`src/utils/file-loader.ts`** — Smart file loader: detects file size, picks JSON.parse or streaming
7. **`src/scripts/find-components.ts`** — First script: find all `component` fields matching a glob pattern
8. **`src/types.ts`** — Shared types for Storyblok migration structures

## Architecture

### Two-tier approach:
- **Small/medium files (< 512MB):** `JSON.parse()` → recursive in-memory traversal
- **Large files (>= 512MB):** `stream-json` streaming parser → event-based traversal

### Core traversal utility (`src/utils/traverse.ts`):
- Generic recursive walker that visits every node in the JSON tree
- Accepts a visitor callback: `(value: unknown, key: string | number, path: string[]) => void`
- Handles arrays, objects, and primitives at any depth
- Used by all validation scripts

### Streaming traversal (`src/utils/stream-traverse.ts`):
- Uses `stream-json` + `StreamValues` or custom token tracking
- Tracks the current JSON path as it streams
- Fires the same visitor callback interface — so validation logic works with both approaches

### Smart file loader (`src/utils/file-loader.ts`):
- Checks file size with `Bun.file(path).size`
- If < 512MB threshold: reads + `JSON.parse()`, returns parsed data
- If >= 512MB: returns a stream handle for streaming traversal
- Exposes a unified API: `processFile(path, visitor)` that picks the right strategy

## First Script: `find-components`

**Purpose:** Find all `component` fields at any nesting depth whose value matches a glob-like pattern (e.g. `*-section`).

**CLI interface:**
```bash
bun run src/scripts/find-components.ts <file-path> <pattern>

# Examples:
bun run src/scripts/find-components.ts ./migration-previews/some-file.json "*-section"
bun run src/scripts/find-components.ts ./migration-previews/some-file.json "sb-*"
bun run src/scripts/find-components.ts ./migration-previews/some-file.json "*"  # all components
```

**Output:** For each match, print:
- The JSON path to the component (e.g. `[0].story.content.body[2].content[0]`)
- The `component` value (e.g. `sb-section`)
- The `_uid` if present (for easy identification)

**Pattern matching:** Convert glob pattern to regex (`*` → `.*`, escape the rest).

## Verification

1. Run the script against the existing sample file:
   ```bash
   bun run src/scripts/find-components.ts ./migration-previews/dry-run--290291523060748---story-to-migrate__2026-2-4_16-51.json "*-section"
   ```
   Should find 12 matches (the `sb-section` and `sb-list-section` entries we saw in grep).

2. Run with `"*"` pattern to list ALL components — verify count matches `grep -c '"component":' file.json`.

3. Test glob patterns: `"sb-list-*"`, `"*-group"`, exact match `"sb-headline"`.
