import { runRuleSetValidatorCli } from "./validate-rule-set.js";
import { v3toV4AllMigrationsRuleSetConfig } from "./v3toV4-rule-set-configs.js";

runRuleSetValidatorCli(
  v3toV4AllMigrationsRuleSetConfig,
  "src/scripts/validate-v3toV4AllMigrations.ts",
).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
