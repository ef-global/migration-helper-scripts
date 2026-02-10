import type { RuleSetConfig } from "./validate-rule-set.js";

export const legacyFieldShapeMigrationsRuleSetConfig: RuleSetConfig = {
  ruleSetName: "legacyFieldShapeMigrations",
  rules: {
    "sb-body-text": {
      forbiddenFields: ["view_more"],
      checkItemBasis: true,
    },
    "sb-button-group": {
      forbiddenFields: ["layout", "item_flex"],
      checkItemBasis: true,
    },
    "sb-link": {
      forbiddenFields: ["variant", "small", "mono", "underline"],
      checkItemBasis: true,
    },
  },
  wrapperNormalization: {
    wrapperToBase: {
      "sb-body-text-section": "sb-body-text",
      "sb-body-text-flex-group": "sb-body-text",
      "sb-button-group-section": "sb-button-group",
      "sb-button-group-flex-group": "sb-button-group",
      "sb-link-flex-group": "sb-link",
    },
  },
  noIssuesMessage: "No legacyFieldShapeMigrations issues found.",
};

export const designCleanupMigrationsRuleSetConfig: RuleSetConfig = {
  ruleSetName: "designCleanupMigrations",
  rules: {
    "sb-card": {
      forbiddenFields: ["horizontal", "background", "on_dark"],
    },
    "sb-collapsible": {
      forbiddenFields: [
        "direction",
        "gap",
        "wrap",
        "justify",
        "align",
        "text_color",
      ],
    },
  },
  wrapperNormalization: {
    wrapperToBase: {
      "sb-card-section": "sb-card",
      "sb-card-flex-group": "sb-card",
      "sb-collapsible-section": "sb-collapsible",
      "sb-collapsible-flex-group": "sb-collapsible",
    },
  },
  noIssuesMessage: "No designCleanupMigrations issues found.",
};

export const renameAndSizeFormatMigrationsRuleSetConfig: RuleSetConfig = {
  ruleSetName: "renameAndSizeFormatMigrations",
  rules: {
    "sb-iframe": {
      forbiddenFields: ["aspectRatio"],
    },
    "sb-social-embed": {
      forbiddenFields: ["item_width", "item_height"],
      checkEmbedSizes: true,
    },
  },
  wrapperNormalization: {
    wrapperToBase: {
      "sb-iframe-section": "sb-iframe",
      "sb-social-embed-section": "sb-social-embed",
      "sb-social-embed-flex-group": "sb-social-embed",
    },
  },
  noIssuesMessage: "No renameAndSizeFormatMigrations issues found.",
};

export const safetyNetMigrationsRuleSetConfig: RuleSetConfig = {
  ruleSetName: "safetyNetMigrations",
  rules: {
    "sb-teaser-card": {
      requiredFields: ["visibility"],
    },
  },
  wrapperNormalization: {
    wrapperToBase: {
      "sb-teaser-card-section": "sb-teaser-card",
    },
  },
  noIssuesMessage: "No safetyNetMigrations issues found.",
};

export const itemsToContentRuleSetConfig: RuleSetConfig = {
  ruleSetName: "itemsToContent",
  rules: {
    "sb-accordion": { forbiddenTopLevelKeys: ["items"] },
    "sb-list": { forbiddenTopLevelKeys: ["items"] },
    "sb-tabs": { forbiddenTopLevelKeys: ["items"] },
  },
  wrapperNormalization: {
    wrapperToBase: {
      "sb-accordion-section": "sb-accordion",
      "sb-accordion-flex-group": "sb-accordion",
      "sb-list-section": "sb-list",
      "sb-list-flex-group": "sb-list",
      "sb-tabs-section": "sb-tabs",
    },
  },
  noIssuesMessage: "No itemsToContent issues found.",
};

export const v3toV4FieldRemovalMigrationRuleSetConfig: RuleSetConfig = {
  ruleSetName: "v3toV4FieldRemovalMigration",
  rules: {
    "sb-accordion": { forbiddenFields: ["inverse"] },
    "sb-avatar": { forbiddenFields: ["stroke", "theme", "inverse"] },
    "sb-banner": { forbiddenFields: ["variant"] },
    "sb-content-group": { forbiddenFields: ["text_align", "text_color"] },
    "sb-countdown-timer": { forbiddenFields: ["inverse"] },
    "sb-divider": { forbiddenFields: ["inverse"] },
    "sb-form": { forbiddenFields: ["inverse"] },
    "sb-link-tile": { forbiddenFields: ["inverse"] },
    "sb-list": { forbiddenFields: ["variant", "inverse"] },
    "sb-tabs": { forbiddenFields: ["on_dark", "mono"] },
    "sb-trustpilot": { forbiddenFields: ["inverse"] },
    "sb-video": { forbiddenFields: ["inverse_icon", "play_button_mono"] },
    "sb-video-card": { forbiddenFields: ["play_button_mono"] },
  },
  wrapperNormalization: {
    wrapperToBase: {
      "sb-accordion-section": "sb-accordion",
      "sb-accordion-flex-group": "sb-accordion",
      "sb-content-group-section": "sb-content-group",
      "sb-content-group-flex-group": "sb-content-group",
      "sb-divider-section": "sb-divider",
      "sb-divider-flex-group": "sb-divider",
      "sb-form-section": "sb-form",
      "sb-link-tile-section": "sb-link-tile",
      "sb-list-section": "sb-list",
      "sb-list-flex-group": "sb-list",
      "sb-tabs-section": "sb-tabs",
      "sb-video-section": "sb-video",
      "sb-video-card-section": "sb-video-card",
    },
  },
  noIssuesMessage: "No v3toV4FieldRemovalMigration issues found.",
};

const sectionAndFlexGroupWrapperNormalization = {
  "sb-flex-group-section": "sb-flex-group",
  "sb-flex-group-flex-group": "sb-flex-group",
} as const;

const combinedWrapperMap = {
  ...(legacyFieldShapeMigrationsRuleSetConfig.wrapperNormalization?.wrapperToBase ??
    {}),
  ...(designCleanupMigrationsRuleSetConfig.wrapperNormalization?.wrapperToBase ??
    {}),
  ...(renameAndSizeFormatMigrationsRuleSetConfig.wrapperNormalization
    ?.wrapperToBase ?? {}),
  ...(safetyNetMigrationsRuleSetConfig.wrapperNormalization?.wrapperToBase ?? {}),
  ...(itemsToContentRuleSetConfig.wrapperNormalization?.wrapperToBase ?? {}),
  ...(v3toV4FieldRemovalMigrationRuleSetConfig.wrapperNormalization
    ?.wrapperToBase ?? {}),
  ...sectionAndFlexGroupWrapperNormalization,
};

export const v3toV4AllMigrationsRuleSetConfig: RuleSetConfig = {
  ruleSetName: "v3toV4AllMigrations",
  rules: {
    ...legacyFieldShapeMigrationsRuleSetConfig.rules,
    ...designCleanupMigrationsRuleSetConfig.rules,
    ...renameAndSizeFormatMigrationsRuleSetConfig.rules,
    ...safetyNetMigrationsRuleSetConfig.rules,
    ...itemsToContentRuleSetConfig.rules,
    ...v3toV4FieldRemovalMigrationRuleSetConfig.rules,
  },
  wrapperNormalization: {
    wrapperToBase: combinedWrapperMap,
  },
  noIssuesMessage: "No v3toV4AllMigrations issues found.",
};
