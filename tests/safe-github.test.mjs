import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const mod = jiti("../packages/safe-github/src/index.ts");

const {
  default: safeGithub,
  parseGitHubRemote,
  isGitHubPrUrl,
  normalizePrListLimit,
  requirePositiveInteger,
  buildPrEditArgv,
} = mod;

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("parseGitHubRemote supports HTTPS remotes", () => {
  assert.deepEqual(parseGitHubRemote("https://github.com/owner/repo.git"), {
    owner: "owner",
    repo: "repo",
  });
  assert.deepEqual(parseGitHubRemote("https://github.com/owner/repo"), {
    owner: "owner",
    repo: "repo",
  });
});

test("parseGitHubRemote supports SSH remotes", () => {
  assert.deepEqual(parseGitHubRemote("git@github.com:owner/repo.git"), {
    owner: "owner",
    repo: "repo",
  });
  assert.deepEqual(parseGitHubRemote("ssh://git@github.com/owner/repo.git"), {
    owner: "owner",
    repo: "repo",
  });
});

test("parseGitHubRemote rejects non-GitHub remotes", () => {
  assert.equal(parseGitHubRemote("https://gitlab.com/owner/repo.git"), null);
  assert.equal(parseGitHubRemote("file:///tmp/repo"), null);
});

test("isGitHubPrUrl validates GitHub PR URLs", () => {
  assert.equal(isGitHubPrUrl("https://github.com/owner/repo/pull/123"), true);
  assert.equal(isGitHubPrUrl("https://github.com/owner/repo/pull/123/files"), true);
  assert.equal(isGitHubPrUrl("https://github.com/owner/repo/issues/123"), false);
  assert.equal(isGitHubPrUrl("https://example.com/owner/repo/pull/123"), false);
});

test("normalizePrListLimit defaults and caps limits", () => {
  assert.equal(normalizePrListLimit(undefined), 20);
  assert.equal(normalizePrListLimit(0), 1);
  assert.equal(normalizePrListLimit(3.8), 3);
  assert.equal(normalizePrListLimit(99), 50);
});

test("requirePositiveInteger rejects invalid PR numbers", () => {
  assert.doesNotThrow(() => requirePositiveInteger(1, "number"));
  assert.throws(() => requirePositiveInteger(0, "number"), /positive integer/);
  assert.throws(() => requirePositiveInteger(1.2, "number"), /positive integer/);
});

test("extension registers the expanded safe-github tool surface", () => {
  const tools = [];
  safeGithub({
    registerTool(definition) {
      tools.push(definition);
    },
  });

  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
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
  );
  for (const tool of tools) {
    assert.equal(typeof tool.execute, "function");
    assert.ok(tool.parameters);
  }
});

// ---------------------------------------------------------------------------
// github_pr_edit tests
// ---------------------------------------------------------------------------

test("github_pr_edit tool is registered", () => {
  const tools = [];
  safeGithub({
    registerTool(definition) {
      tools.push(definition);
    },
  });

  const editTool = tools.find((t) => t.name === "github_pr_edit");
  assert.ok(editTool, "github_pr_edit should be registered");
  assert.equal(typeof editTool.execute, "function");
  assert.ok(editTool.parameters);
});

test("buildPrEditArgv — title-only edit by number", () => {
  const argv = buildPrEditArgv({ number: 42, title: "New title" });
  assert.deepEqual(argv, ["pr", "edit", "42", "--title", "New title"]);
});

test("buildPrEditArgv — body-only edit by url", () => {
  const argv = buildPrEditArgv({ url: "https://github.com/owner/repo/pull/99", body: "New body" });
  assert.deepEqual(argv, ["pr", "edit", "https://github.com/owner/repo/pull/99", "--body", "New body"]);
});

test("buildPrEditArgv — title and body edit by current branch (no selector)", () => {
  const argv = buildPrEditArgv({ title: "T", body: "B" });
  assert.deepEqual(argv, ["pr", "edit", "--title", "T", "--body", "B"]);
});

test("buildPrEditArgv — body-only by current branch (no selector)", () => {
  const argv = buildPrEditArgv({ body: "New body only" });
  assert.deepEqual(argv, ["pr", "edit", "--body", "New body only"]);
});
