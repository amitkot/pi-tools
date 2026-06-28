# Security Policy

## Supported versions

This repository is early-stage. Security fixes target the latest version on the default branch.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Report security concerns privately to the repository owner through GitHub, or by opening a minimal private advisory if available.

## Security model

Pi extensions run with host permissions. This repository therefore prefers narrow, typed tools over generic shell bridges.

Repository-wide expectations:

- no arbitrary shell command tool is exposed
- subprocesses use argv arrays via `execFile`, not shell strings
- command output and errors are bounded and sanitized where applicable
- tools should expose the minimum host operation needed for the task

Package-specific notes:

- `safe-github` does not expose `gh auth token`, raw `gh api`, or arbitrary `gh` command execution. Mutating operations (`github_pr_create`, `github_pr_edit`) are gated by Pi's permission prompt.
- `open-zed` only opens files in Zed. It does not edit files or expose arbitrary `zed` commands.
- `deliver-code-changes` runs mutating Git and GitHub operations after one explicit `/deliver` confirmation. It refuses obvious secret-bearing files and builds subprocess calls from fixed argv arrays rather than shell strings.
- `precommit-setup` writes `.pre-commit-config.yaml` and optionally runs `prek install` or `pre-commit install` only after one explicit `/add-precommit` confirmation.

Users should review extension code before installing any Pi package from this repository.
