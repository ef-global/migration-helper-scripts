import {
  runRuleSetValidatorCli,
} from "./validate-rule-set.js";
import { v3toV4FieldRemovalMigrationRuleSetConfig } from "./v3toV4-rule-set-configs.js";

runRuleSetValidatorCli(
  v3toV4FieldRemovalMigrationRuleSetConfig,
  "src/scripts/validate-v3toV4FieldRemovalMigration.ts",
).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
