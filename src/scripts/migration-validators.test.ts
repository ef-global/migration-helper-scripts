import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type ValidatorReport = {
  file: string;
  ok: boolean;
  issueCount: number;
  issues: Array<{
    componentPath: string;
    component: string;
    uid: string | null;
    message: string;
  }>;
};

const thisFilePath = fileURLToPath(import.meta.url);
const thisDirPath = dirname(thisFilePath);
const projectRootPath = resolve(thisDirPath, "../..");

function writeFixture(data: unknown): string {
  const tempDir = mkdtempSync(join(tmpdir(), "migration-validator-"));
  const filePath = join(tempDir, "fixture.json");
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  return filePath;
}

function runValidator(
  scriptName: string,
  fixturePath: string,
): ValidatorReport {
  const result = spawnSync(
    "bun",
    ["run", `src/scripts/${scriptName}`, fixturePath, "--json"],
    {
      cwd: projectRootPath,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Validator ${scriptName} failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }

  return JSON.parse(result.stdout) as ValidatorReport;
}

describe("migration validators mapped 1:1 to migration names", () => {
  test("legacyFieldShapeMigrations catches legacy fields and wrappers", () => {
    const fixturePath = writeFixture([
      {
        component: "sb-link",
        _uid: "uid-link",
        design: {
          fields: {
            small: { values: { s: true } },
            item_basis: { values: { s: "1/2" } },
          },
        },
      },
      {
        component: "sb-button-group-flex-group",
        _uid: "uid-button-group-wrapper",
        design: { fields: {} },
      },
    ]);

    const report = runValidator(
      "validate-legacyFieldShapeMigrations.ts",
      fixturePath,
    );

    expect(report.ok).toBe(false);
    expect(report.issueCount).toBe(3);
    expect(report.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Forbidden field still present: design.fields.small",
        "item_basis values still in V3 format (values.s)",
        "Wrapper component still present: component=sb-button-group-flex-group (expected sb-button-group)",
      ]),
    );
  });

  test("designCleanupMigrations catches legacy design fields and wrappers", () => {
    const fixturePath = writeFixture([
      {
        component: "sb-card",
        _uid: "uid-card",
        design: {
          fields: {
            horizontal: { values: { s: true } },
          },
        },
      },
      {
        component: "sb-collapsible-section",
        _uid: "uid-collapsible-wrapper",
        design: { fields: {} },
      },
    ]);

    const report = runValidator(
      "validate-designCleanupMigrations.ts",
      fixturePath,
    );

    expect(report.ok).toBe(false);
    expect(report.issueCount).toBe(2);
    expect(report.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Forbidden field still present: design.fields.horizontal",
        "Wrapper component still present: component=sb-collapsible-section (expected sb-collapsible)",
      ]),
    );
  });

  test("renameAndSizeFormatMigrations catches legacy names/formats and wrappers", () => {
    const fixturePath = writeFixture([
      {
        component: "sb-social-embed",
        _uid: "uid-social",
        design: {
          fields: {
            item_width: { values: { s: 100 } },
            embed_height: { values: { s: "500" } },
          },
        },
      },
      {
        component: "sb-iframe-section",
        _uid: "uid-iframe-wrapper",
        design: { fields: {} },
      },
    ]);

    const report = runValidator(
      "validate-renameAndSizeFormatMigrations.ts",
      fixturePath,
    );

    expect(report.ok).toBe(false);
    expect(report.issueCount).toBe(3);
    expect(report.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Forbidden field still present: design.fields.item_width",
        "embed_height values still in V3 format (values.s)",
        "Wrapper component still present: component=sb-iframe-section (expected sb-iframe)",
      ]),
    );
  });

  test("safetyNetMigrations requires visibility and catches wrappers", () => {
    const fixturePath = writeFixture([
      {
        component: "sb-teaser-card",
        _uid: "uid-teaser",
        design: {
          fields: {},
        },
      },
      {
        component: "sb-teaser-card-section",
        _uid: "uid-teaser-wrapper",
        design: { fields: {} },
      },
    ]);

    const report = runValidator("validate-safetyNetMigrations.ts", fixturePath);

    expect(report.ok).toBe(false);
    expect(report.issueCount).toBe(2);
    expect(report.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Required field missing: design.fields.visibility",
        "Wrapper component still present: component=sb-teaser-card-section (expected sb-teaser-card)",
      ]),
    );
  });

  test("itemsToContent catches legacy items key and wrappers", () => {
    const fixturePath = writeFixture([
      {
        component: "sb-tabs",
        _uid: "uid-tabs",
        items: [{ _uid: "tab-1" }],
      },
      {
        component: "sb-list-section",
        _uid: "uid-list-wrapper",
        items: [],
      },
    ]);

    const report = runValidator("validate-itemsToContent.ts", fixturePath);

    expect(report.ok).toBe(false);
    expect(report.issueCount).toBe(2);
    expect(report.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Forbidden top-level key still present: items",
        "Wrapper component still present: component=sb-list-section (expected sb-list)",
      ]),
    );
  });

  test("v3toV4FieldRemovalMigration catches forbidden fields and wrappers", () => {
    const fixturePath = writeFixture([
      {
        component: "sb-content-group",
        _uid: "uid-content-group",
        design: {
          fields: {
            text_align: { values: { s: "start" } },
          },
        },
      },
      {
        component: "sb-list-section",
        _uid: "uid-list-wrapper",
        design: { fields: {} },
      },
    ]);

    const report = runValidator(
      "validate-v3toV4FieldRemovalMigration.ts",
      fixturePath,
    );

    expect(report.ok).toBe(false);
    expect(report.issueCount).toBe(2);
    expect(report.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Forbidden field still present: design.fields.text_align",
        "Wrapper component still present: component=sb-list-section (expected sb-list)",
      ]),
    );
  });

  test("v3toV4AllMigrations catches cross-group issues in one run", () => {
    const fixturePath = writeFixture([
      {
        component: "sb-link",
        _uid: "uid-link",
        design: {
          fields: {
            small: { values: { s: true } },
          },
        },
      },
      {
        component: "sb-card",
        _uid: "uid-card",
        design: {
          fields: {
            horizontal: { values: { s: true } },
          },
        },
      },
      {
        component: "sb-content-group",
        _uid: "uid-content-group",
        design: {
          fields: {
            text_color: { values: { s: "primary" } },
          },
        },
      },
      {
        component: "sb-teaser-card",
        _uid: "uid-teaser",
        design: { fields: {} },
      },
      {
        component: "sb-content-group-section",
        _uid: "uid-content-group-wrapper",
        design: { fields: {} },
      },
      {
        component: "sb-flex-group-section",
        _uid: "uid-flex-group-wrapper",
        design: { fields: {} },
      },
    ]);

    const report = runValidator(
      "validate-v3toV4AllMigrations.ts",
      fixturePath,
    );

    expect(report.ok).toBe(false);
    expect(report.issueCount).toBeGreaterThanOrEqual(6);
    expect(report.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Forbidden field still present: design.fields.small",
        "Forbidden field still present: design.fields.horizontal",
        "Forbidden field still present: design.fields.text_color",
        "Required field missing: design.fields.visibility",
        "Wrapper component still present: component=sb-content-group-section (expected sb-content-group)",
        "Wrapper component still present: component=sb-flex-group-section (expected sb-flex-group)",
      ]),
    );
  });

  test("all new validators pass when data is already migrated", () => {
    const fixturePath = writeFixture([
      {
        component: "sb-body-text",
        _uid: "uid-body-text-ok",
        design: {
          fields: {
            text_overflow: { values: { s: "expand" } },
            item_basis: { values: { s: { value: "1/2", unit: "fra" } } },
          },
        },
      },
      {
        component: "sb-card",
        _uid: "uid-card-ok",
        design: {
          fields: {
            direction: { values: { s: "row" } },
          },
        },
      },
      {
        component: "sb-social-embed",
        _uid: "uid-social-ok",
        design: {
          fields: {
            embed_width: { values: { s: { value: "100", unit: "%" } } },
            embed_height: { values: { s: { value: "500", unit: "px" } } },
          },
        },
      },
      {
        component: "sb-teaser-card",
        _uid: "uid-teaser-ok",
        design: {
          fields: {
            visibility: { values: { s: "show" } },
          },
        },
      },
      {
        component: "sb-content-group",
        _uid: "uid-content-group-ok",
        design: {
          fields: {
            spacing: { values: { s: "md" } },
          },
        },
      },
    ]);

    const reports = [
      runValidator("validate-legacyFieldShapeMigrations.ts", fixturePath),
      runValidator("validate-designCleanupMigrations.ts", fixturePath),
      runValidator("validate-renameAndSizeFormatMigrations.ts", fixturePath),
      runValidator("validate-safetyNetMigrations.ts", fixturePath),
      runValidator("validate-itemsToContent.ts", fixturePath),
      runValidator("validate-v3toV4FieldRemovalMigration.ts", fixturePath),
      runValidator("validate-v3toV4AllMigrations.ts", fixturePath),
    ];

    reports.forEach((report) => {
      expect(report.ok).toBe(true);
      expect(report.issueCount).toBe(0);
    });
  });
});
