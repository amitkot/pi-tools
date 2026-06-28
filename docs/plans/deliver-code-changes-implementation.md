# Implementation plan: deliver code changes

Date: 2026-06-18

## Target

Implement the plan in `docs/plans/deliver-code-changes.md` as a new `pi-tools` package that provides both:

- a Pi extension command, `/deliver`
- a Pi skill, `deliver-code-changes`

Suggested package path:

```text
packages/deliver-code-changes/
```

## Assumptions

- `pi-tools` stays a monorepo with package-local README files.
- The package should be installable through the root `pi.extensions` / `pi.skills` manifest.
- Runtime implementation can use Node built-ins and Pi extension APIs only at first.
- The command runs from the extension process and should use fixed argv arrays, not shell command strings assembled from model input.
- The first version supports GitHub PR creation through the installed `gh` CLI.

## Non-goals for first implementation

- No custom TUI wizard beyond built-in `ctx.ui.confirm` / `ctx.ui.editor` / `ctx.ui.input` if needed.
- No automatic remediation of failed checks.
- No CI polling after PR creation.
- No merge/release workflow.
- No generic command runner exposed to the LLM.

## Proposed files

```text
packages/deliver-code-changes/
  package.json
  README.md
  src/
    index.ts
    git.ts
    checks.ts
    docs-policy.ts
    pr.ts
    output.ts
  skills/
    deliver-code-changes/
      SKILL.md

tests/
  deliver-code-changes.test.mjs
```

Root updates:

```text
package.json
README.md
SECURITY.md
CHANGELOG.md
```

## Package manifest

Add package-local `package.json` similar to existing packages:

```json
{
  "name": "@amitkot/pi-deliver-code-changes",
  "version": "0.1.0",
  "type": "module",
  "description": "Pi extension and skill for delivering code changes with one approval gate.",
  "keywords": ["pi-package", "pi", "pi-extension", "pi-skill"],
  "main": "src/index.ts",
  "pi": {
    "extensions": ["src/index.ts"],
    "skills": ["skills"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*"
  },
  "license": "MIT"
}
```

Update the root `package.json` `pi` manifest to include skills if needed:

```json
"pi": {
  "extensions": ["packages/*/src/index.ts"],
  "skills": ["packages/*/skills"]
}
```

## Extension command behavior

Register:

```ts
pi.registerCommand("deliver", {
  description: "Run final checks, commit changes, and open a PR with one approval gate",
  handler: async (args, ctx) => { ... }
});
```

### High-level flow

1. Wait for idle if needed.
2. Gather repository context with read-only commands.
3. Detect checks/configuration.
4. Build confirmation summary.
5. Ask for one approval.
6. Run checks.
7. Re-read status.
8. Refuse unsafe files/states.
9. Stage changes.
10. Commit.
11. Push branch.
12. Create PR.
13. Notify/report result.

### Detailed flow

Pseudo-code:

```ts
await ctx.waitForIdle();

const repo = await getRepoContext(pi, ctx.cwd);
if (!repo.ok) return notifyError(...);

const status = await getStatus(pi, repo.root);
if (status.files.length === 0) return notifyInfo("No changes to deliver");

const config = await loadDeliverConfig(repo.root);
const checks = await detectChecks(repo.root, config);
const warnings = await collectPolicyWarnings(repo.root, status.files, config);
const title = await proposeTitle(ctx, status.files);
const body = buildPrBody(...);

const confirmed = await confirmOnce(ctx, { repo, status, checks, warnings, title, body });
if (!confirmed) return;

await runChecks(pi, repo.root, checks, ctx.ui);

const latestStatus = await getStatus(pi, repo.root);
assertSafeStatus(latestStatus);

await gitAddAll(pi, repo.root);
await gitCommit(pi, repo.root, title, commitBody);
await gitPushCurrentBranch(pi, repo.root);
const pr = await createPr(pi, repo.root, { base: repo.base, title, body, draft: config.prDraft });

ctx.ui.notify(`Delivered: ${pr.url}`, "info");
```

## Repository context helpers

Implement helpers that call fixed commands:

- `git rev-parse --show-toplevel`
- `git rev-parse --abbrev-ref HEAD`
- `git status --porcelain=v1 -z`
- `git remote get-url origin`
- `git symbolic-ref refs/remotes/origin/HEAD --short`
- fallback: `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`

Refuse states:

- not in Git repo
- detached HEAD
- branch equals default/base branch
- `.git/MERGE_HEAD`, `.git/rebase-merge`, or `.git/rebase-apply` present
- no changed files

## Command execution helper

Create a small internal wrapper around `pi.exec(command, args, options)`:

- always pass command and args separately
- set `cwd` to repo root when supported by Pi's `exec` options; if not available, use `git -C <repo>` for Git commands and run other commands from `ctx.cwd` only after confirming API support
- bound stdout/stderr in returned errors
- redact common token-like values
- throw typed errors with command name and truncated output

Avoid shell constructs like `cmd1 && cmd2`.

## Check detection

### Config-first

Read optional config:

```text
.pi/deliver.json
```

Suggested schema:

```ts
type DeliverConfig = {
  checks?: Array<{ name: string; command: string; args?: string[] }>;
  base?: string;
  prDraft?: boolean;
  docsPolicy?: "off" | "warn" | "stop";
};
```

Validate narrowly:

- `command` must be a bare executable name, no slashes in first version unless explicitly needed
- `args` must be strings
- reject empty names/commands

### Auto-detection

If no checks are configured:

1. If `package.json` has `scripts.check`, add `npm run check`.
2. If `package.json` has `scripts.test`, add `npm test`.
3. If `prek` is available and one of these exists, add `prek run --all-files`:
   - `.pre-commit-config.yaml`
   - `.pre-commit-config.yml`

If no checks are detected, stop and tell the user to add `.pi/deliver.json`. Do not deliver without checks in v1.

## `prek` handling

Prefer `prek run --all-files` when available.

Detection options:

- `prek --version`
- optionally `python -m prek --version` only if this is already used in local projects

Do not silently fall back to `pre-commit` in v1 unless explicitly configured.

## Docs/changelog/env policy

Implement lightweight warnings in `docs-policy.ts`.

Inputs:

- changed file list
- optional diff names from `git diff --name-only HEAD`
- repository file existence

Initial checks:

1. Secret-like files:
   - block `.env`
   - block `.env.*` except `.env.example`, `.env.sample`, `.env.template`
   - block `.npmrc`, `.netrc`, files under `.ssh/`, private key-looking names
2. `.env.example` warning:
   - if code/config files changed and repo has `.env.example` but it is unchanged, warn
   - keep this broad in v1; do not parse actual env var additions yet
3. Changelog warning:
   - if `CHANGELOG.md` exists and package/source files changed but changelog unchanged, warn
4. Docs warning:
   - if `README.md` or `docs/` exists and package README, CLI, or public extension surfaces changed but no docs changed, warn

Policy behavior:

- `off`: skip warnings except secret blocks
- `warn`: include warnings in confirmation and final report
- `stop`: stop before confirmation if warnings exist

Default: `warn`.

## Commit title/body

First implementation options, in order:

1. If `/deliver <title>` args are present, use them as the commit/PR title.
2. Else, ask for a title once before the final confirmation.
3. Use a generated body containing:
   - summary of changed files
   - checks run
   - warnings, if any

Keep the final confirmation as the only approval gate. A title input is data entry, not an approval gate.

Potential later improvement: derive title from the last assistant report or a model-generated summary.

## PR creation

Use fixed `gh` calls:

- preflight auth: `gh auth status`
- check current branch PR: `gh pr view --json number,url,title,state`
- create: `gh pr create --base <base> --title <title> --body <body>` plus `--draft` when configured

First version behavior if an open PR already exists for the branch:

- stop and show the PR URL
- do not edit it automatically

Later version can support updating the existing PR body.

## Skill content

Create `packages/deliver-code-changes/skills/deliver-code-changes/SKILL.md`:

```md
---
name: deliver-code-changes
description: Use when the user asks to deliver, submit, commit, or open a PR for completed code changes. Guides the agent to review docs/changelog/env implications and then invoke /deliver for the one-gate delivery workflow.
---

# Deliver Code Changes

Before invoking `/deliver`:

- Confirm the requested implementation is complete.
- Confirm relevant verification has already passed or will be run by `/deliver`.
- Review whether docs, changelog, `.env.example`, migrations, config examples, or security notes need updates.
- Do not invoke `/deliver` if known acceptance criteria are unmet.

When ready, invoke `/deliver` and provide a concise commit/PR title if the user supplied one.
```

## Tests

Add `tests/deliver-code-changes.test.mjs`.

Recommended unit-testable exports:

- config validation
- check detection from fixture files
- porcelain status parsing
- default branch parsing
- secret-file blocking
- docs/changelog/env warning generation
- command argv builders for Git/GitHub operations
- extension registration smoke test
- skill file existence and frontmatter validation

Avoid live GitHub calls in automated tests.

Add the new test file to root `npm test`.

## Docs updates

Update root `README.md`:

- add package under Packages
- mention `/deliver`
- mention the skill

Add package README:

- what it does
- one approval gate model
- requirements: Git, GitHub CLI, `prek` if configured
- optional `.pi/deliver.json`
- safety stops

Update `SECURITY.md`:

- note that this package runs mutating Git and GitHub operations after one explicit confirmation
- document that it refuses obvious secret files and uses fixed argv command construction

Update `CHANGELOG.md`:

- add unreleased entry for `@amitkot/pi-deliver-code-changes`

## Implementation sequence

1. Add package skeleton and root manifest entries.
2. Add skill and validate Pi skill frontmatter rules.
3. Implement pure helpers and tests first:
   - status parser
   - config loader/validator
   - check detector
   - policy warnings
   - argv builders
4. Implement command registration with dry read-only preflight.
5. Add single confirmation UI.
6. Add check execution and stop-on-fail behavior.
7. Add stage/commit/push/PR creation.
8. Add README/SECURITY/CHANGELOG updates.
9. Run verification:
   - `npm run check`
   - `npm test`
10. Manual smoke test in a disposable GitHub repo.

## Manual smoke test

Use a disposable repository and branch:

1. Create a small file change.
2. Run Pi with this package loaded.
3. Invoke `/deliver test delivery workflow`.
4. Confirm once.
5. Verify checks run.
6. Verify a commit is created.
7. Verify branch is pushed.
8. Verify PR opens with expected title/body.
9. Close/delete the test PR/branch.

## Risks

- `pi.exec` option support for cwd should be checked in the installed Pi version before implementation.
- GitHub CLI output and auth errors must be sanitized.
- Hooks may modify files; therefore status must be re-read after checks and before committing.
- One approval gate should not become silent unsafe behavior. Prefer hard stops over additional prompts.

## Acceptance criteria

- New package is loadable as a Pi package.
- `/deliver` appears in Pi command list.
- `deliver-code-changes` skill is discoverable.
- Unit tests cover pure parsing/config/policy logic.
- `npm run check` passes.
- `npm test` passes.
- Manual smoke test demonstrates one confirmation in the successful path.
