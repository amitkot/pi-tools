import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const tools = [];

const mod = jiti("../packages/safe-github/src/index.ts");
const safeGithub = mod.default ?? mod;

safeGithub({
  registerTool(definition) {
    tools.push(definition);
  },
});

const expected = [
  "github_auth_status",
  "github_repo_info",
  "github_pr_list",
  "github_pr_view",
  "github_pr_create",
];

const actual = tools.map((tool) => tool.name);
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error("Unexpected tool surface:", actual);
  process.exit(1);
}

console.log(`safe-github registered ${tools.length} tools: ${actual.join(", ")}`);
