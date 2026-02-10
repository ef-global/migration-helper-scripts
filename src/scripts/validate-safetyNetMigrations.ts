import {
  runRuleSetValidatorCli,
} from "./validate-rule-set.js";
import { safetyNetMigrationsRuleSetConfig } from "./v3toV4-rule-set-configs.js";

runRuleSetValidatorCli(
  safetyNetMigrationsRuleSetConfig,
  "src/scripts/validate-safetyNetMigrations.ts",
).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
