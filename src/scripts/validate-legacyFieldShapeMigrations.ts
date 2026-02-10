import {
  runRuleSetValidatorCli,
} from "./validate-rule-set.js";
import { legacyFieldShapeMigrationsRuleSetConfig } from "./v3toV4-rule-set-configs.js";

runRuleSetValidatorCli(
  legacyFieldShapeMigrationsRuleSetConfig,
  "src/scripts/validate-legacyFieldShapeMigrations.ts",
).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
