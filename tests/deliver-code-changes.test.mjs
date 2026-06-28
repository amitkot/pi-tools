import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const mod = jiti("../packages/deliver-code-changes/src/index.ts");

const {
  default: deliverCodeChanges,
  assertPolicyAllows,
  buildBranchPlan,
  collectPolicyFindings,
  detectChecks,
  extractSessionTouchedPaths,
  generatedBranchName,
  ghAuthStatusArgv,
  ghCreatePrArgv,
  ghCurrentPrViewArgv,
  gitAddAllArgv,
  gitAddPathsArgv,
  gitCommitArgv,
  gitFetchBaseArgv,
  gitPullFfOnlyArgv,
  gitPushCurrentBranchArgv,
  gitStashPopArgv,
  gitStashPushArgv,
  gitSwitchArgv,
  gitSwitchCreateArgv,
  isBareExecutable,
  isSecretLikePath,
  loadDeliverConfig,
  parseAheadBehind,
  parseDefaultBranch,
  parseStatusPorcelainZ,
  selectDeliveryFiles,
  slugifyBranchTitle,
  validateDeliverConfig,
} = mod;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(
        () => console.log(`ok - ${name}`),
        (error) => {
          console.error(`not ok - ${name}`);
          throw error;
        },
      );
    }
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), "pi-deliver-test-"));
}

await test("validateDeliverConfig accepts narrow valid config", () => {
  const config = validateDeliverConfig({
    checks: [{ name: "check", command: "npm", args: ["run", "check"] }],
    base: "main",
    prDraft: true,
    docsPolicy: "stop",
  });
  assert.deepEqual(config, {
    checks: [{ name: "check", command: "npm", args: ["run", "check"] }],
    base: "main",
    prDraft: true,
    docsPolicy: "stop",
  });
});

await test("validateDeliverConfig rejects unsafe command names", () => {
  assert.equal(isBareExecutable("npm"), true);
  assert.equal(isBareExecutable("./script"), false);
  assert.equal(isBareExecutable("npm run"), false);
  assert.throws(
    () => validateDeliverConfig({ checks: [{ name: "bad", command: "./script", args: [] }] }),
    /bare executable/,
  );
});

await test("loadDeliverConfig accepts comments and trailing commas", async () => {
  const root = await tempDir();
  await mkdir(path.join(root, ".pi"));
  await writeFile(path.join(root, ".pi", "deliver.json"), `{
    // final checks
    "checks": [
      { "name": "check", "command": "npm", "args": ["run", "check",], },
    ],
    "docsPolicy": "warn",
  }`);
  const config = await loadDeliverConfig(root);
  assert.deepEqual(config.checks, [{ name: "check", command: "npm", args: ["run", "check"] }]);
});

await test("detectChecks finds npm scripts and prek when available", async () => {
  const root = await tempDir();
  await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { check: "node check.js", test: "node test.js" } }));
  await writeFile(path.join(root, ".pre-commit-config.yaml"), "repos: []\n");
  const checks = await detectChecks(root, { prDraft: false, docsPolicy: "warn" }, { prekAvailable: true });
  assert.deepEqual(checks, [
    { name: "check", command: "npm", args: ["run", "check"] },
    { name: "test", command: "npm", args: ["test"] },
    { name: "prek", command: "prek", args: ["run", "--all-files"] },
  ]);
});

await test("detectChecks returns configured checks first", async () => {
  const root = await tempDir();
  const checks = await detectChecks(root, {
    checks: [{ name: "unit", command: "node", args: ["test.mjs"] }],
    prDraft: false,
    docsPolicy: "warn",
  });
  assert.deepEqual(checks, [{ name: "unit", command: "node", args: ["test.mjs"] }]);
});

await test("parseStatusPorcelainZ parses modified, untracked, and renamed files", () => {
  const output = " M README.md\0?? src/new.ts\0R  src/new-name.ts\0src/old-name.ts\0";
  assert.deepEqual(parseStatusPorcelainZ(output), [
    { index: " ", worktree: "M", path: "README.md" },
    { index: "?", worktree: "?", path: "src/new.ts" },
    { index: "R", worktree: " ", path: "src/new-name.ts", originalPath: "src/old-name.ts" },
  ]);
});

await test("parseDefaultBranch normalizes origin HEAD", () => {
  assert.equal(parseDefaultBranch("origin/main\n"), "main");
  assert.equal(parseDefaultBranch("main\n"), "main");
  assert.equal(parseDefaultBranch(""), null);
});

await test("branch helpers detect stale branches and generate fresh branch plans", () => {
  assert.deepEqual(parseAheadBehind("2\t1\n"), { baseAhead: 2, branchAhead: 1 });
  assert.equal(slugifyBranchTitle("Add /deliver command!"), "add-deliver-command");
  assert.equal(generatedBranchName("Add /deliver command!"), "feature/add-deliver-command");

  const repo = { root: "/repo", branch: "feature/old", base: "main", gitDir: "/repo/.git" };
  assert.deepEqual(buildBranchPlan({ repo, title: "Add delivery", aheadBehind: { baseAhead: 2, branchAhead: 1 } }), {
    mode: "fresh",
    branch: "feature/add-delivery",
    base: "main",
    fromBranch: "feature/old",
    reasons: ["current branch is behind origin/main by 2 commit(s)"],
  });
  assert.deepEqual(buildBranchPlan({ repo, title: "Add delivery", aheadBehind: { baseAhead: 0, branchAhead: 0 } }), {
    mode: "current",
    branch: "feature/old",
    reasons: ["current branch is usable"],
  });
});

await test("branch plan creates a fresh branch from base when invoked on base", () => {
  const repo = { root: "/repo", branch: "main", base: "main", gitDir: "/repo/.git" };
  assert.deepEqual(buildBranchPlan({ repo, title: "Add delivery", aheadBehind: null }), {
    mode: "fresh",
    branch: "feature/add-delivery",
    base: "main",
    fromBranch: "main",
    reasons: ["current branch is the base branch"],
  });
});

await test("session file selection stages only touched files by default", () => {
  const entries = [
    {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "toolCall", name: "write", arguments: { path: "packages/deliver-code-changes/src/index.ts" } },
          {
            type: "toolCall",
            name: "multi_tool_use.parallel",
            arguments: {
              tool_uses: [
                { recipient_name: "functions.edit", parameters: { path: "package.json" } },
              ],
            },
          },
        ],
      },
    },
  ];
  const touched = extractSessionTouchedPaths(entries);
  assert.deepEqual(touched, ["package.json", "packages/deliver-code-changes/src/index.ts"]);

  const changedFiles = [
    { index: " ", worktree: "M", path: "package.json" },
    { index: " ", worktree: "M", path: "package-lock.json" },
    { index: " ", worktree: "M", path: "packages/deliver-code-changes/src/index.ts" },
    { index: "?", worktree: "?", path: "packages/precommit-setup/src/index.ts" },
  ];
  const selection = selectDeliveryFiles({ changedFiles, sessionTouchedPaths: touched });
  assert.deepEqual(selection.selected.map((file) => file.path), [
    "package.json",
    "package-lock.json",
    "packages/deliver-code-changes/src/index.ts",
  ]);
  assert.deepEqual(selection.excluded.map((file) => file.path), ["packages/precommit-setup/src/index.ts"]);
});

await test("explicit file selection supports include, exclude, and all modes", () => {
  const changedFiles = [
    { index: " ", worktree: "M", path: "README.md" },
    { index: "?", worktree: "?", path: "docs/plans/a.md" },
    { index: "?", worktree: "?", path: "packages/precommit-setup/src/index.ts" },
  ];
  assert.deepEqual(
    selectDeliveryFiles({ changedFiles, sessionTouchedPaths: [], includePaths: ["docs"] }).selected.map((file) => file.path),
    ["docs/plans/a.md"],
  );
  assert.deepEqual(
    selectDeliveryFiles({ changedFiles, sessionTouchedPaths: [], all: true, excludePaths: ["packages/precommit-setup"] }).selected.map((file) => file.path),
    ["README.md", "docs/plans/a.md"],
  );
});

await test("secret-like paths are blocked", () => {
  assert.equal(isSecretLikePath(".env"), true);
  assert.equal(isSecretLikePath(".env.production"), true);
  assert.equal(isSecretLikePath(".env.example"), false);
  assert.equal(isSecretLikePath(".ssh/id_ed25519"), true);
  assert.equal(isSecretLikePath("keys/service.pem"), true);
});

await test("policy warnings cover env, changelog, and docs heuristics", async () => {
  const root = await tempDir();
  await mkdir(path.join(root, "docs"));
  await writeFile(path.join(root, ".env.example"), "FOO=\n");
  await writeFile(path.join(root, "CHANGELOG.md"), "# Changelog\n");
  await writeFile(path.join(root, "README.md"), "# README\n");

  const findings = await collectPolicyFindings(root, ["packages/example/src/index.ts"], "warn");
  assert.equal(findings.blocks.length, 0);
  assert.equal(findings.warnings.length, 3);
});

await test("policy blocks likely secrets and stop policy escalates warnings", async () => {
  const root = await tempDir();
  await writeFile(path.join(root, "CHANGELOG.md"), "# Changelog\n");
  const findings = await collectPolicyFindings(root, [".env", "src/index.ts"], "stop");
  assert.match(findings.blocks[0], /likely secret/);
  assert.throws(() => assertPolicyAllows(findings, "stop"), /likely secret/);

  const warningOnly = await collectPolicyFindings(root, ["src/index.ts"], "stop");
  assert.throws(() => assertPolicyAllows(warningOnly, "stop"), /CHANGELOG/);
});

await test("argv builders produce fixed command arrays", () => {
  assert.deepEqual(gitAddAllArgv(), ["add", "-A"]);
  assert.deepEqual(gitAddPathsArgv(["README.md"]), ["add", "-A", "--", "README.md"]);
  assert.deepEqual(gitCommitArgv("Title", "Body"), ["commit", "-m", "Title", "-m", "Body"]);
  assert.deepEqual(gitFetchBaseArgv("main"), ["fetch", "origin", "main"]);
  assert.deepEqual(gitPullFfOnlyArgv("main"), ["pull", "--ff-only", "origin", "main"]);
  assert.deepEqual(gitPushCurrentBranchArgv(), ["push", "-u", "origin", "HEAD"]);
  assert.deepEqual(gitStashPushArgv("msg"), ["stash", "push", "--include-untracked", "--message", "msg"]);
  assert.deepEqual(gitStashPopArgv(), ["stash", "pop"]);
  assert.deepEqual(gitSwitchArgv("main"), ["switch", "main"]);
  assert.deepEqual(gitSwitchCreateArgv("feature/x"), ["switch", "-c", "feature/x"]);
  assert.deepEqual(ghAuthStatusArgv(), ["auth", "status"]);
  assert.deepEqual(ghCurrentPrViewArgv(), ["pr", "view", "--json", "number,url,title,state"]);
  assert.deepEqual(ghCreatePrArgv({ base: "main", title: "T", body: "B", draft: true }), [
    "pr",
    "create",
    "--base",
    "main",
    "--title",
    "T",
    "--body",
    "B",
    "--draft",
  ]);
});

await test("extension registers /deliver command", () => {
  const commands = [];
  deliverCodeChanges({
    registerCommand(name, definition) {
      commands.push({ name, definition });
    },
  });
  assert.equal(commands.length, 1);
  assert.equal(commands[0].name, "deliver");
  assert.equal(typeof commands[0].definition.handler, "function");
});

await test("skill file exists with valid frontmatter", async () => {
  const skill = await readFile(
    path.join("packages", "deliver-code-changes", "skills", "deliver-code-changes", "SKILL.md"),
    "utf-8",
  );
  assert.match(skill, /^---\nname: deliver-code-changes\n/m);
  assert.match(skill, /description: .{20,}/);
});
