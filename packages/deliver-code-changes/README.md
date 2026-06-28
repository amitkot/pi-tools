# @amitkot/pi-deliver-code-changes

Pi extension and skill for delivering completed code changes with one explicit confirmation.

## What it provides

- `/deliver` command: runs final checks, stages all changes, commits, pushes the current branch, and opens a GitHub PR.
- `deliver-code-changes` skill: guidance for the agent to use `/deliver` only after the implementation is complete and docs/config implications were reviewed.

## Approval model

`/deliver` gathers read-only context first, then shows one confirmation summary. If confirmed, it runs the delivery sequence without asking repeatedly in the happy path.

It stops instead of prompting again when it sees risk, including:

- not a Git repository
- detached HEAD
- branch preparation cannot safely move local changes to a delivery branch
- merge or rebase in progress
- no local changes
- no configured or detected checks
- failed checks
- obvious secret-bearing files such as `.env`, `.npmrc`, `.netrc`, SSH keys, or private keys
- an open PR already exists for the branch

## Requirements

- Git repository with an `origin` remote
- GitHub CLI (`gh`) installed and authenticated (`gh auth status`)
- `npm` when using detected npm checks
- `prek` when configured or when a pre-commit config is present and detected

## Optional configuration

Create `.pi/deliver.json` in a repository:

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

If no checks are configured, `/deliver` detects:

- `npm run check` when `package.json` has `scripts.check`
- `npm test` when `package.json` has `scripts.test`
- `prek run --all-files` when `prek` is available and a pre-commit config exists

If no checks are configured or detected, delivery stops.

`docsPolicy` values:

- `off`: skip docs/changelog/env warnings, but still block likely secrets
- `warn` (default): show warnings in the confirmation and PR body
- `stop`: stop before confirmation when warnings exist

## Usage

```text
/deliver Add delivery workflow
```

If no title is supplied, the command asks for a commit/PR title before the final confirmation.

File handling:

- By default, `/deliver` stages only changed files touched by `write`/`edit` tools in the current Pi session.
- If `package.json` is selected and `package-lock.json` changed, the lockfile is selected too.
- Use `--all` to restore the original "stage all changes" behavior.
- Use `--include <path>` / `--path <path>` and `--exclude <path>` to adjust the selected file list.
- This is file-level scoping. If a selected file contains unrelated hunks, `/deliver` cannot split them automatically.

Branch handling:

- If you are on the base branch, `/deliver` creates a fresh `feature/<title-slug>` branch from the updated base branch.
- If the current branch is behind `origin/<base>`, `/deliver` treats it as likely stale: it stashes local changes, fetches and fast-forwards the base branch, creates a fresh delivery branch, and pops the stash there.
- Otherwise it uses the current branch.
- Use `--new-branch` to force a fresh branch, `--branch <name>` to choose its name, or `--current-branch` to force the current branch.

Examples:

```text
/deliver --new-branch Add delivery workflow
/deliver --branch feature/deliver-code-changes Add delivery workflow
/deliver --current-branch Add delivery workflow
/deliver --include packages/deliver-code-changes --include tests/deliver-code-changes.test.mjs Add delivery workflow
/deliver --all Add delivery workflow
```

## Security notes

This package runs mutating Git and GitHub operations only after the confirmation dialog. Subprocesses are built from fixed argv arrays; it does not expose a generic shell command runner.
