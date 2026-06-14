# Security Policy

## Supported versions

This repository is early-stage. Security fixes target the latest version on the default branch.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Report security concerns privately to the repository owner through GitHub, or by opening a minimal private advisory if available.

## Security model

Pi extensions run with host permissions. This repository therefore prefers narrow, typed tools over generic shell bridges.

For `safe-github` specifically:

- no arbitrary `gh` command execution is exposed
- no `gh auth token` tool is exposed
- raw `gh api` is not exposed as a tool
- mutating operations are preview-first and require `confirm: true`
- subprocesses use argv arrays via `execFile`, not shell strings
- outputs and errors are bounded and sanitized

Users should review extension code before installing any Pi package from this repository.
