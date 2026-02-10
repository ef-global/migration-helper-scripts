import {
  runRuleSetValidatorCli,
} from "./validate-rule-set.js";
import { designCleanupMigrationsRuleSetConfig } from "./v3toV4-rule-set-configs.js";

runRuleSetValidatorCli(
  designCleanupMigrationsRuleSetConfig,
  "src/scripts/validate-designCleanupMigrations.ts",
).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
