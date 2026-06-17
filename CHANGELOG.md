# Changelog

All notable changes to this repository will be documented here.

## Unreleased

### Added

- Expanded `safe-github` tool surface for PR checks/files/diffs/comments/reviews/merge, workflow runs/logs/reruns/cancel, commit status, branch info, issues, workflows, and releases.
- `github_pr_edit` tool — update an existing PR's title and/or body by number, URL, or current branch.

## 0.1.0 - 2026-06-14

### Added

- Initial `safe-github` Pi extension — host-side typed GitHub bridge for common `gh` operations.
- `open-zed` Pi extension — opens files in the Zed IDE from Pi, bypassing macOS sandbox restrictions.
- Permission-gated `github_pr_create` workflow with preview support.
- Monorepo package layout for future Pi plugins.
- Basic tests and load checks.
