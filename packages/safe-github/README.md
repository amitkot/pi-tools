# safe-github extension

A narrow, typed GitHub operation surface for Pi.

## Purpose
Provides safe, host-side GitHub operations via the `gh` CLI, bypassing macOS sandbox TLS issues in the sandboxed bash tool.

## Threat Model
- **Risk**: Accidental PR creation, accidental operations on wrong repo, shell injection.
- **Mitigations**:
  - Uses `child_process.execFile` with argument arrays (no shell).
  - Adds execution timeout and output limits.
  - Validates and normalizes all parameters.
  - Infers owner/repo from the active Pi session cwd unless an explicit `cwd` is provided.
  - Mutating operations preview unless `confirm: true`.
  - Mutation previews show argv arrays and body length, not the full PR body.
  - Does not expose `gh auth token`.
  - Fails closed on ambiguity (detached HEAD, dirty worktree, non-GitHub origin, default branch PR creation, ambiguous PR selector).
  - Does not pass full process environment to subprocesses.

## Installation

```bash
pi install npm:@amitkot/pi-safe-github
```

For local development from a checkout:

```bash
pi -e ./packages/safe-github/src/index.ts
```

If you are working inside this repository, Pi can also auto-load the project-local shim at `.pi/extensions/safe-github/index.ts` after the project is trusted.

To install the whole pi-tools monorepo from git:

```bash
pi install git:github.com/amitkot/pi-tools
```

After installation or changes, restart Pi or run:

```text
/reload
```

## Requirements

- GitHub CLI (`gh`) installed on the host machine
- Host `gh` authenticated (`gh auth status`)
- Run Pi from inside a GitHub-backed git repository for repo/PR tools

## Tools (v1)

### Read-only (No approval required)
- `github_auth_status` — verify gh CLI auth and logged-in user
- `github_repo_info` — current repo identity (owner, name, branches, URL, worktree root)
- `github_pr_list` — list PRs with filters (state, author, head, limit)
- `github_pr_view` — view a specific PR by number, URL, or current branch

### Mutating (requires `confirm: true`)
- `github_pr_create` — create a PR for the current branch

## Approval Model
For `github_pr_create`:
1. Agent calls the tool with default parameters (confirm defaults to `false`).
2. The tool returns a preview showing the repo, branch, base, title, body length, draft flag, and planned argv arrays with the body redacted.
3. After user explicitly approves, the agent calls again with `confirm: true` to execute.

## Prompt Guidelines
- Use `github_pr_create` instead of `gh pr create`.
- For mutations, always call first with `confirm: false`, show the preview to the user, and only call with `confirm: true` after explicit approval.
- Never use raw `gh api`, `gh auth token`, or shell for GitHub operations when these tools are available.

## Deferred (not in v1)
- `github_pr_checks` — deferred until core tools pass real tests
- `github_pr_merge` — deferred until it can enforce open/draft/check/mergeability safeguards
- `github_issue_create`, `github_pr_comment`, `github_pr_ready`, `github_workflow_run`, `github_release_create`

## Testing

### Test 1: prove sandbox TLS failure still exists
In normal sandboxed Pi bash:
```
gh api /user --jq .login
```
Expected if sandbox issue present: TLS certificate verification error.

### Test 2: prove extension host-side gh works
Call `github_auth_status`. Expected: success, GitHub username, no token.

### Test 3: repo detection
Call `github_repo_info`. Expected: correct owner/repo/branch/URL/root.

### Test 4: read-only PR operations
Call `github_pr_list` and `github_pr_view`. Expected: work without approval, compact output.

### Test 5: PR creation dry run
On a clean feature branch, call `github_pr_create` without `confirm`. Expected: preview only, no push, no PR created. The preview should show argv arrays and body length, not the full PR body.

### Test 6: PR creation execution
After user approval, call with `confirm: true` in a test repo/branch. Expected: push if needed, PR created, URL returned, no TLS failure.

### Test 7: failure cases
- default branch → refuses
- dirty worktree → refuses
- detached HEAD → refuses
- non-GitHub origin → refuses
- invalid cwd → refuses
- omitted `confirm` → does not mutate
