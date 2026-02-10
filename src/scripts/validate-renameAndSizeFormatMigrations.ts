import {
  runRuleSetValidatorCli,
} from "./validate-rule-set.js";
import { renameAndSizeFormatMigrationsRuleSetConfig } from "./v3toV4-rule-set-configs.js";

runRuleSetValidatorCli(
  renameAndSizeFormatMigrationsRuleSetConfig,
  "src/scripts/validate-renameAndSizeFormatMigrations.ts",
).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
