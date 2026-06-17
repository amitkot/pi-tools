# GH extension tools — gaps and missing verbs

Analysis from webhook-bridge implementation session (2026-06-16).

Status: the expanded `safe-github` implementation now adds the missing wrapper tools listed below. Keep this document as historical context and as a checklist for manual smoke testing against real GitHub repositories.

## Critical gaps

### 1. Check run details in `github_pr_view`

Currently shows `FAILURE: 1, SUCCESS: 2` with no breakdown of which check
failed, the error message, or a link to the log.

**Missing data:** Per-check name, status, conclusion, URL, and (optionally)
the last few log lines or failure summary.

### 2. No `github_run_list` / `github_run_view`

`gh run list` / `gh run view` is the primary tool for debugging CI failures.
When a check fails, you need to see the job logs. There's currently no tool
for this at all.

**Suggested verbs:**
- `github_run_list` — list recent workflow runs (filterable by branch, status, event)
- `github_run_view` — show jobs within a run, each job's conclusion, and optionally tail logs

### 3. Commit status (per-commit, not PR-aggregated)

The PR view aggregates all commits' checks, making it ambiguous whether a
failure is from the current commit or a previous one.

**Suggested verb:** `github_commit_status` — show combined status + check runs
for a specific SHA, with conclusion per check.

## Useful additions

| Verb | Purpose |
|---|---|
| `github_pr_merge` | Merge PR after approval (strategy: merge/squash/rebase) |
| `github_pr_review` | Submit review (approve, comment, request changes) |
| `github_branch_info` | Branch existence, protection rules, ahead/behind counts |
| `github_issue_list` | Issue tracking (list) |
| `github_issue_view` | Issue tracking (view single) |
| `github_release_create` | Tag + release with artifacts |

## Data gaps in existing tools

| Tool | Missing |
|---|---|
| `github_pr_view` | Check details (names, conclusions, URLs), mergeable state, review status |
| `github_pr_list` | Check conclusion summary per PR, draft status |
| `github_repo_info` | Visibility (public/private), permissions of the token |
| `github_pr_create` | No `--draft` flag exposed — resolved |
