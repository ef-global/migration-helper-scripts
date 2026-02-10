import type { RuleSetConfig as BaseRuleSetConfig } from "./validate-rule-set.js";

export type RuleSetConfig = BaseRuleSetConfig;

export type MigrationValidationIssue = {
  componentPath: string;
  component: string;
  uid: string | null;
  message: string;
};

export type MigrationValidationReport = {
  ok: boolean;
  issueCount: number;
  issues: MigrationValidationIssue[];
};

export type MigrationValidationDataFn = (context: {
  data: unknown;
  isDebug?: boolean;
}) => MigrationValidationReport | Promise<MigrationValidationReport>;

export type MigrationValidationFileFn = (context: {
  filePath: string;
  isDebug?: boolean;
}) => MigrationValidationReport | Promise<MigrationValidationReport>;

export type MigrationValidationModule = {
  id: string;
  name: string;
  ruleSet?: RuleSetConfig;
  validateData?: MigrationValidationDataFn;
  validateFile?: MigrationValidationFileFn;
};
