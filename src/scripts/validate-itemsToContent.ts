import { runRuleSetValidatorCli } from "./validate-rule-set.js";
import { itemsToContentRuleSetConfig } from "./v3toV4-rule-set-configs.js";

runRuleSetValidatorCli(
  itemsToContentRuleSetConfig,
  "src/scripts/validate-itemsToContent.ts",
).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
