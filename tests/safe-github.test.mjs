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

test("extension registers exactly the v1 tool surface", () => {
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
      "github_pr_list",
      "github_pr_view",
      "github_pr_create",
    ],
  );
  for (const tool of tools) {
    assert.equal(typeof tool.execute, "function");
    assert.ok(tool.parameters);
  }
});
