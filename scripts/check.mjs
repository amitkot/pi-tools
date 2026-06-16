import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);

const packages = [
  {
    name: "safe-github",
    entry: "../packages/safe-github/src/index.ts",
    expectedTools: [
      "github_auth_status",
      "github_repo_info",
      "github_pr_list",
      "github_pr_view",
      "github_pr_create",
      "github_pr_edit",
    ],
  },
  {
    name: "open-zed",
    entry: "../packages/open-zed/src/index.ts",
    expectedTools: ["open_zed"],
  },
];

for (const pkg of packages) {
  const tools = [];
  const mod = jiti(pkg.entry);
  const extension = mod.default ?? mod;

  extension({
    registerTool(definition) {
      tools.push(definition);
    },
  });

  const actual = tools.map((tool) => tool.name);
  if (JSON.stringify(actual) !== JSON.stringify(pkg.expectedTools)) {
    console.error(`Unexpected ${pkg.name} tool surface:`, actual);
    process.exit(1);
  }

  console.log(`${pkg.name} registered ${tools.length} tools: ${actual.join(", ")}`);
}
