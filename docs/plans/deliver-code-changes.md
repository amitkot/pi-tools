# Plan: deliver code changes

Date: 2026-06-18

## Problem

Finishing a coding task currently requires several separate agent/tool actions:

1. run lint/checks
2. run tests
3. run pre-commit hooks through `prek`
4. decide whether docs, changelog, `.env.example`, migrations, or other supporting files are complete
5. commit the changes
6. open a pull request

Each step can trigger its own permission prompt. The desired workflow is a single explicit delivery action with one approval gate in the normal successful path.

## Goal

Add a Pi delivery workflow for repositories that have local changes ready to submit.

The workflow should:

- run the repo's configured quality gates
- stop on failures with actionable output
- perform conservative repository hygiene checks before committing
- stage and commit the intended changes
- open a pull request
- require only one user confirmation in the normal happy path

## Recommended shape

Build both:

1. a Pi extension command, initially `/deliver`, that performs the deterministic host-side workflow
2. a small Pi skill, `deliver-code-changes`, that tells the agent when to use `/deliver` and what to review before invoking it

The extension is the main implementation. The skill is guidance for the agent, not the approval mechanism.

## Why an extension rather than only a skill

A skill can instruct the model to run the right checklist, but it still relies on normal tool calls for `bash`, Git, pre-commit, and GitHub operations. That means multiple permission prompts are still likely.

An extension command can show one explicit confirmation dialog and then run the approved sequence internally with `pi.exec(...)`. This gives a single approval gate while keeping the workflow narrow and auditable.

## Scope

### Extension command

Register:

```text
/deliver
```

Initial supported behavior:

- operate on the current Git repository only
- refuse to run outside a Git repository
- refuse to run on the default branch unless explicitly overridden in a later version
- detect changed files with `git status --porcelain`
- show a single confirmation summary before any mutating delivery step
- run configured checks
- run `prek run --all-files` when `prek` is available or configured
- stage all changes after checks pass
- create a commit
- create a PR against the detected default branch
- report the commit SHA and PR URL

### Skill

Provide a load-on-demand skill that tells the agent to:

- finish implementation and ordinary verification first
- review whether docs, changelog, `.env.example`, migrations, or config examples are needed
- avoid invoking `/deliver` while known acceptance criteria remain unmet
- invoke `/deliver` when the user asks to deliver, submit, commit, or open a PR

## Non-goals

- No generic shell tool.
- No arbitrary GitHub API access.
- No automatic fix-up of lint/test failures in the extension.
- No semantic proof that documentation is complete.
- No pushing, committing, or opening PRs without explicit user confirmation.
- No CI polling or merge automation in the first version.
- No support for non-Git repositories in the first version.

## Approval model

Normal path:

1. User or agent invokes `/deliver`.
2. Extension gathers read-only context:
   - repo root
   - current branch
   - default/base branch
   - changed files
   - checks to run
   - planned commit/PR behavior
3. Extension shows one confirmation dialog.
4. If confirmed, it runs checks, commits, pushes if needed, and opens a PR.

The extension should stop rather than ask repeatedly when it sees risk. Examples:

- no UI available for confirmation
- not a Git repo
- no changes
- merge/rebase in progress
- current branch is default branch
- checks fail
- possible secret files are staged or untracked
- docs/env/changelog heuristic fails in strict mode
- PR already exists and updating it is not implemented yet

This keeps the normal path to one approval while preserving safe hard stops.

## Check selection

The first version should support repo-local configuration plus simple detection.

Suggested config file, optional:

```jsonc
{
  "checks": [
    { "name": "check", "command": "npm", "args": ["run", "check"] },
    { "name": "test", "command": "npm", "args": ["test"] },
    { "name": "prek", "command": "prek", "args": ["run", "--all-files"] }
  ],
  "base": "main",
  "prDraft": false,
  "docsPolicy": "warn"
}
```

Possible config path:

```text
.pi/deliver.json
```

If no config exists, detect common commands conservatively:

- `npm run check` when `package.json` has `scripts.check`
- `npm test` when `package.json` has `scripts.test`
- `prek run --all-files` when `prek` is present on `PATH` or a pre-commit config exists and `prek` is available

Do not guess destructive or deployment commands.

## Docs / changelog / env verification

This should be implemented as conservative heuristics, not as a claim of semantic completeness.

Initial heuristics:

- if code references new environment variable names and `.env.example` exists but is unchanged, warn or stop depending on policy
- if public docs exist and user-facing commands/options changed, warn if no docs changed
- if `CHANGELOG.md` exists and package/public behavior changed, warn if unchanged
- if migrations/schema files changed, warn if no related docs or tests changed

Default should be `warn`: include warnings in the confirmation summary and final report, but do not create multiple prompts. Add a stricter `stop` policy later if useful.

## Commit and PR behavior

Initial proposal:

- generate a commit message from the current session context when possible, otherwise ask for a title in the initial confirmation flow or use a concise fallback
- stage with `git add -A` after checks pass
- commit with `git commit -m <title> [-m <body>]`
- push with `git push -u origin HEAD`
- create PR with `gh pr create --base <base> --title <title> --body <body>`

The extension may use host `git` and `gh` through `pi.exec(...)`/argv-style calls. It must not expose arbitrary shell strings to the model.

## Security notes

- Treat `/deliver` as mutating and user-confirmed.
- Build subprocess commands from fixed argv arrays.
- Bound command output shown to the agent/user.
- Sanitize diagnostics and never print tokens.
- Refuse to include obvious secret-bearing files such as `.env`, SSH keys, `.npmrc`, `.netrc`, or credential files.
- Do not add a general `runCommand` input.

## Open questions

- Should the command ask for commit title/PR title in the confirmation dialog, or generate from the last task summary and allow editing?
- Should PR creation use direct `gh` inside this package or depend on/reuse `safe-github` helpers if they are factored out?
- Should the first version update an existing PR on the branch, or stop with a clear message?
- Should docs/changelog/env warnings block by default in Amit's own repos, or only warn?

## Acceptance criteria

- `/deliver` registers as a Pi extension command.
- A packaged skill named `deliver-code-changes` is discoverable.
- The normal happy path has one extension confirmation dialog before mutating work.
- The command runs check, test, and `prek` gates when configured/detected.
- The command stops on failed checks and does not commit or open a PR.
- The command refuses obvious unsafe repository states.
- The command commits and opens a PR in a test repository.
- README, package README, changelog, and security notes are updated.
- `npm run check` and `npm test` pass.
