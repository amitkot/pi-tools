# safe-github extension

A narrow, typed GitHub operation surface for Pi.

## Purpose

Provides safe, host-side GitHub operations via the `gh` CLI, bypassing macOS sandbox TLS issues in the sandboxed bash tool.

## Threat Model

- **Risk**: accidental mutation, operations on the wrong repo, shell injection, token exposure.
- **Mitigations**:
  - Uses `child_process.execFile` with argument arrays; no shell strings.
  - Adds execution timeouts and output limits.
  - Validates and normalizes parameters.
  - Infers owner/repo from the active Pi session cwd unless `cwd` is provided.
  - High-risk mutations preview unless `confirm: true`.
  - Mutation previews redact long bodies/notes.
  - Does not expose `gh auth token` or a generic `gh` / `gh api` tool.
  - Does not pass the full process environment to subprocesses.

## Installation

```bash
pi install npm:@amitkot/pi-safe-github
```

For local development from a checkout:

```bash
pi -e ./packages/safe-github/src/index.ts
```

If you are working inside this repository, Pi can also auto-load the project-local shim at `.pi/extensions/safe-github/index.ts` after the project is trusted.

## Requirements

- GitHub CLI (`gh`) installed on the host machine
- Host `gh` authenticated (`gh auth status`)
- Run Pi from inside a GitHub-backed git repository for repo/PR tools

## Tools

### Read-oriented

- `github_auth_status` — verify gh CLI auth and logged-in user
- `github_repo_info` — repo identity, branches, visibility, viewer permission
- `github_branch_info` — branch existence, protection, ahead/behind
- `github_pr_list` — list PRs with filters
- `github_pr_view` — view a PR or current-branch PR
- `github_pr_checks` — detailed PR checks with links
- `github_pr_files` — changed files for a PR
- `github_pr_diff` — truncated PR diff/patch
- `github_run_list` — list workflow runs
- `github_run_view` — view run jobs and failed steps
- `github_commit_status` — commit status and check runs for SHA/HEAD
- `github_issue_list` — list issues
- `github_issue_view` — view issue
- `github_workflow_list` — list workflows
- `github_workflow_view` — view workflow summary/YAML
- `github_release_list` — list releases
- `github_release_view` — view release details/assets

### Sensitive read

- `github_run_logs` — fetch/tail workflow logs. Recommended permission: `ask`.

### Mutating

- `github_pr_create` — preview/create PR
- `github_pr_edit` — edit PR title/body
- `github_pr_comment` — comment on PR
- `github_pr_review` — approve/comment/request changes
- `github_pr_ready` — mark draft PR ready
- `github_pr_close` / `github_pr_reopen`
- `github_pr_merge` — preview/merge with safeguards
- `github_issue_create`
- `github_issue_comment`
- `github_issue_edit`
- `github_issue_close` / `github_issue_reopen`
- `github_workflow_dispatch` — preview/dispatch workflow
- `github_run_rerun` — preview/rerun workflow run/job
- `github_run_cancel` — preview/cancel workflow run
- `github_release_create` — preview/create release
- `github_release_upload_asset` — preview/upload one release asset

## Approval Model

Configure mutating tool names as `ask` in `@gotgenes/pi-permission-system`.

High-risk tools also require `confirm: true` internally:

- `github_pr_create`
- `github_pr_merge`
- `github_workflow_dispatch`
- `github_run_rerun`
- `github_run_cancel`
- `github_release_create`
- `github_release_upload_asset`

Calling these without `confirm: true` returns a preview only.

Recommended permission examples are in `docs/plans/safe-github-expanded-tools.md`.

## Prompt Guidelines

- Use these typed tools instead of raw `gh` commands.
- Use `github_auth_status` before GitHub operations when auth is uncertain.
- Use `github_repo_info` before mutating operations to confirm the repo/branch.
- Never use raw `gh api`, `gh auth token`, or shell for GitHub operations when these tools are available.

## Testing

```bash
npm run check
npm test
```

Manual smoke tests after `/reload`:

1. Call `github_auth_status`.
2. Call `github_repo_info`.
3. Call `github_pr_list` / `github_pr_view`.
4. Use `github_pr_checks`, `github_run_list`, and `github_run_view` on a repo with Actions.
5. Call a high-risk mutation without `confirm`; expected: preview only.
6. Call the same mutation with `confirm: true` only in a test repo/branch and approve the Pi permission prompt.
