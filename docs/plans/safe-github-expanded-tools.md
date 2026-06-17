# Safe GitHub expanded tool surface

Date: 2026-06-16

## Scope

Add typed `safe-github` wrappers for the GitHub operations the agent currently has to reach for raw `gh` to perform.

Keep the design compatible with `@gotgenes/pi-permission-system` by exposing permission-relevant actions as distinct Pi tool names rather than one generic `gh` tool.

## Assumptions

- Read-only GitHub metadata tools may execute without an internal `confirm` field; the permission system can still ask/deny by exact tool name.
- Mutating tools should be exact tool names and should be configured as `ask` in the permission system.
- High-risk mutations (`merge`, workflow dispatch/rerun/cancel, release creation/upload) also require `confirm: true` internally so omission is safe.
- Existing safety properties remain: `execFile`, argv arrays, bounded output, sanitized errors, no raw `gh auth token`, no generic `gh`/`gh api` tool.

## Non-goals

- No arbitrary GitHub API explorer.
- No repository deletion/archive/transfer tools.
- No secrets, variables, collaborators, teams, deploy keys, or permission administration.
- No unrestricted `gh` passthrough.

## Tool groups

### CI and checks

- `github_pr_checks`
- `github_run_list`
- `github_run_view`
- `github_run_logs`
- `github_commit_status`

### PR read/detail helpers

- `github_pr_files`
- `github_pr_diff`

### PR mutations

- `github_pr_comment`
- `github_pr_review`
- `github_pr_ready`
- `github_pr_close`
- `github_pr_reopen`
- `github_pr_merge`

### Issues

- `github_issue_list`
- `github_issue_view`
- `github_issue_create`
- `github_issue_comment`
- `github_issue_edit`
- `github_issue_close`
- `github_issue_reopen`

### Branch/repo/workflows

- `github_branch_info`
- `github_workflow_list`
- `github_workflow_view`
- `github_workflow_dispatch`
- `github_run_rerun`
- `github_run_cancel`

### Releases

- `github_release_list`
- `github_release_view`
- `github_release_create`
- `github_release_upload_asset`

## Acceptance criteria

- Existing tools keep their names and basic behavior.
- New tools register in deterministic order and load under the test harness.
- All subprocess execution uses `execFile` with argv arrays.
- Mutating high-risk operations do not execute unless `confirm === true`.
- README, root README, changelog, and check/test expected tool lists are updated.
- `npm run check` and `npm test` pass.

## Recommended permission rules

```jsonc
{
  "permission": {
    "github_auth_status": { "*": "allow" },
    "github_repo_info": { "*": "allow" },
    "github_branch_info": { "*": "allow" },
    "github_pr_list": { "*": "allow" },
    "github_pr_view": { "*": "allow" },
    "github_pr_checks": { "*": "allow" },
    "github_pr_files": { "*": "allow" },
    "github_pr_diff": { "*": "allow" },
    "github_run_list": { "*": "allow" },
    "github_run_view": { "*": "allow" },
    "github_commit_status": { "*": "allow" },
    "github_issue_list": { "*": "allow" },
    "github_issue_view": { "*": "allow" },
    "github_workflow_list": { "*": "allow" },
    "github_workflow_view": { "*": "allow" },
    "github_release_list": { "*": "allow" },
    "github_release_view": { "*": "allow" },

    "github_run_logs": { "*": "ask" },
    "github_pr_create": { "*": "ask" },
    "github_pr_edit": { "*": "ask" },
    "github_pr_comment": { "*": "ask" },
    "github_pr_review": { "*": "ask" },
    "github_pr_ready": { "*": "ask" },
    "github_pr_close": { "*": "ask" },
    "github_pr_reopen": { "*": "ask" },
    "github_pr_merge": { "*": "ask" },
    "github_issue_create": { "*": "ask" },
    "github_issue_comment": { "*": "ask" },
    "github_issue_edit": { "*": "ask" },
    "github_issue_close": { "*": "ask" },
    "github_issue_reopen": { "*": "ask" },
    "github_workflow_dispatch": { "*": "ask" },
    "github_run_rerun": { "*": "ask" },
    "github_run_cancel": { "*": "ask" },
    "github_release_create": { "*": "ask" },
    "github_release_upload_asset": { "*": "ask" }
  }
}
```
