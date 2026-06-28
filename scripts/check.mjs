import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);

const packages = [
  {
    name: "safe-github",
    entry: "../packages/safe-github/src/index.ts",
    expectedTools: [
      "github_auth_status",
      "github_repo_info",
      "github_branch_info",
      "github_pr_list",
      "github_pr_view",
      "github_pr_checks",
      "github_pr_files",
      "github_pr_diff",
      "github_pr_create",
      "github_pr_edit",
      "github_pr_comment",
      "github_pr_review",
      "github_pr_ready",
      "github_pr_close",
      "github_pr_reopen",
      "github_pr_merge",
      "github_run_list",
      "github_run_view",
      "github_run_logs",
      "github_commit_status",
      "github_issue_list",
      "github_issue_view",
      "github_issue_create",
      "github_issue_comment",
      "github_issue_edit",
      "github_issue_close",
      "github_issue_reopen",
      "github_workflow_list",
      "github_workflow_view",
      "github_workflow_dispatch",
      "github_run_rerun",
      "github_run_cancel",
      "github_release_list",
      "github_release_view",
      "github_release_create",
      "github_release_upload_asset",
    ],
  },
  {
    name: "open-zed",
    entry: "../packages/open-zed/src/index.ts",
    expectedTools: ["open_zed"],
  },
  {
    name: "deliver-code-changes",
    entry: "../packages/deliver-code-changes/src/index.ts",
    expectedTools: [],
    expectedCommands: ["deliver"],
  },
  {
    name: "precommit-setup",
    entry: "../packages/precommit-setup/src/index.ts",
    expectedTools: [],
    expectedCommands: ["add-precommit"],
  },
];

for (const pkg of packages) {
  const tools = [];
  const commands = [];
  const mod = jiti(pkg.entry);
  const extension = mod.default ?? mod;

  extension({
    registerTool(definition) {
      tools.push(definition);
    },
    registerCommand(name, definition) {
      commands.push({ name, definition });
    },
  });

  const actualTools = tools.map((tool) => tool.name);
  if (JSON.stringify(actualTools) !== JSON.stringify(pkg.expectedTools)) {
    console.error(`Unexpected ${pkg.name} tool surface:`, actualTools);
    process.exit(1);
  }

  const expectedCommands = pkg.expectedCommands ?? [];
  const actualCommands = commands.map((command) => command.name);
  if (JSON.stringify(actualCommands) !== JSON.stringify(expectedCommands)) {
    console.error(`Unexpected ${pkg.name} command surface:`, actualCommands);
    process.exit(1);
  }

  console.log(
    `${pkg.name} registered ${tools.length} tools: ${actualTools.join(", ") || "none"}; commands: ${actualCommands.join(", ") || "none"}`,
  );
}
