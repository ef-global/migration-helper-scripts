import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  discoverMigrationRuns,
  parseMigrationArtifactFileName,
  selectBestAuditArtifactPath,
} from "./discover-migration-runs.js";

function createTempRunsDir(): string {
  return mkdtempSync(join(tmpdir(), "migration-runs-"));
}

function writeJsonFile(
  dir: string,
  fileName: string,
  content: unknown = [],
): string {
  const filePath = join(dir, fileName);
  writeFileSync(filePath, JSON.stringify(content, null, 2), "utf8");
  return filePath;
}

describe("parseMigrationArtifactFileName", () => {
  test("parses standard dry-run story artifacts", () => {
    expect(
      parseMigrationArtifactFileName("dry-run--all---story-input-full.json"),
    ).toEqual({
      fileName: "dry-run--all---story-input-full.json",
      artifactBaseName: "all",
      itemType: "story",
      artifactKind: "input-full",
      timestamp: null,
      isDryRun: true,
    });
  });

  test("parses timestamped custom run names", () => {
    expect(
      parseMigrationArtifactFileName(
        "dry-run--homepage-v4---preset-after-full__2026-2-9_20-51.json",
      ),
    ).toEqual({
      fileName: "dry-run--homepage-v4---preset-after-full__2026-2-9_20-51.json",
      artifactBaseName: "homepage-v4",
      itemType: "preset",
      artifactKind: "after-full",
      timestamp: "2026-2-9_20-51",
      isDryRun: true,
    });
  });

  test("ignores unrelated json files", () => {
    expect(parseMigrationArtifactFileName("something-else.json")).toBeNull();
    expect(parseMigrationArtifactFileName("story-after-full.json")).toBeNull();
  });
});

describe("discoverMigrationRuns", () => {
  test("groups a complete run and enriches it from pipeline summary", async () => {
    const dir = createTempRunsDir();

    writeJsonFile(dir, "dry-run--all---story-input-full.json");
    writeJsonFile(dir, "dry-run--all---story-after-full.json");
    writeJsonFile(dir, "dry-run--all---story-to-migrate.json");
    writeJsonFile(dir, "dry-run--all---story-migration-pipeline-summary.json", {
      totalItems: 5,
      totalChangedItems: 4,
      steps: [
        { validation: { issueCount: 0 } },
        { validation: { issueCount: 2 } },
      ],
    });

    const runs = await discoverMigrationRuns({ root: dir });

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      id: "story::all::no-ts",
      artifactBaseName: "all",
      itemType: "story",
      timestamp: null,
      completeness: {
        diffReady: true,
        auditReady: true,
      },
      isComplete: true,
      summary: {
        totalItems: 5,
        totalChangedItems: 4,
        stepCount: 2,
        validationIssueCount: 2,
      },
    });

    expect(selectBestAuditArtifactPath(runs[0])).toBe(
      join(dir, "dry-run--all---story-to-migrate.json"),
    );
  });

  test("separates timestamped and non-timestamped runs with the same base name", async () => {
    const dir = createTempRunsDir();

    writeJsonFile(dir, "dry-run--demo---story-input-full.json");
    writeJsonFile(dir, "dry-run--demo---story-after-full.json");
    writeJsonFile(dir, "dry-run--demo---story-input-full__2026-2-9_20-51.json");
    writeJsonFile(dir, "dry-run--demo---story-after-full__2026-2-9_20-51.json");

    const runs = await discoverMigrationRuns({ root: dir });

    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.id)).toEqual([
      "story::demo::no-ts",
      "story::demo::2026-2-9_20-51",
    ]);
  });

  test("distinguishes story and preset runs and handles incomplete audit-only runs", async () => {
    const dir = createTempRunsDir();

    writeJsonFile(dir, "dry-run--homepage---story-validation-failed.json", {
      issueCount: 3,
    });
    writeJsonFile(dir, "dry-run--homepage---preset-input-full.json");
    writeJsonFile(dir, "dry-run--homepage---preset-after-full.json");

    const runs = await discoverMigrationRuns({ root: dir });

    expect(runs).toHaveLength(2);

    const storyRun = runs.find((run) => run.itemType === "story");
    const presetRun = runs.find((run) => run.itemType === "preset");

    expect(storyRun).toMatchObject({
      completeness: {
        diffReady: false,
        auditReady: true,
      },
      isComplete: false,
    });
    expect(selectBestAuditArtifactPath(storyRun!)).toBe(
      join(dir, "dry-run--homepage---story-validation-failed.json"),
    );

    expect(presetRun).toMatchObject({
      completeness: {
        diffReady: true,
        auditReady: true,
      },
      isComplete: false,
    });
  });
});
