# Safe GitHub extension follow-up required changes

## Scope

Fix the remaining gaps found after reviewing `.pi/extensions/safe-github` against `docs/plans/safe-github-required-changes.md`.

This is a focused follow-up plan. Keep v1 limited to:

- `github_auth_status`
- `github_repo_info`
- `github_pr_list`
- `github_pr_view`
- `github_pr_create`

Do not re-add `github_pr_checks` or `github_pr_merge` in this pass.

## Current status

The extension now loads via `jiti` and registers the five expected tools with the documented `pi.registerTool({ ... })` API.

The remaining issues are mostly around cwd correctness, fail-closed validation, preview accuracy, safe error reporting, and permission strictness.

## Required changes

### 1. Use Pi tool context cwd by default

Current handlers default to:

```ts
params.cwd ?? process.cwd()
```

This may use the extension process cwd rather than the active Pi session cwd.

Change tool handlers to accept `ctx` from `execute(...)` and default to:

```ts
params.cwd ?? ctx.cwd
```

Apply to:

- `github_auth_status`
- `github_repo_info`
- `github_pr_list`
- `github_pr_view`
- `github_pr_create`

For `github_auth_status`, cwd is not semantically important, but use `ctx.cwd` consistently.

### 2. Make helper signatures consistent

Current `gh(args, cwd)` requires `cwd`, but `github_auth_status` calls it without one.

Fix one of these ways:

- Prefer: require cwd everywhere and pass `ctx.cwd`.
- Alternative: make cwd optional in `gh()` and `git()` where safe.

Do not leave TypeScript-invalid calls.

### 3. Reject ambiguous `github_pr_view` selectors

Plan requires either `number` or `url`, not both.

Add fail-closed validation:

```ts
if (params.number !== undefined && params.url !== undefined) {
  throw new Error("Provide either number or url, not both.");
}
```

Also validate:

- `number` must be a positive integer.
- `url`, if provided, must look like a GitHub PR URL.

### 4. Enforce `github_pr_list` limits in code

Do not rely only on schema validation.

Validate `state` in code:

```ts
const allowedStates = new Set(["open", "closed", "merged", "all"]);
```

Validate and cap `limit` in code:

```ts
const rawLimit = params.limit ?? 20;
const limit = Math.min(Math.max(Math.trunc(rawLimit), 1), 50);
```

Return clear errors for invalid state or non-finite limit.

### 5. Make PR create preview exact and non-leaky

Current preview problems:

- Shows `git push BRANCH` when actual execution uses `git push`.
- Uses shell-like joined strings.
- Includes the full PR body through the `createArgs.join(" ")` preview.

Change preview to show argv arrays and redact long body content.

Example preview details:

```json
{
  "pushArgv": ["git", "push"],
  "createArgv": [
    "gh",
    "pr",
    "create",
    "--title",
    "Example title",
    "--body",
    "<1234 chars>",
    "--base",
    "main"
  ]
}
```

If no upstream:

```json
"pushArgv": ["git", "push", "-u", "origin", "feature-branch"]
```

If upstream exists:

```json
"pushArgv": ["git", "push"]
```

Markdown preview should include:

- repo
- current branch
- base
- title
- body length
- draft flag
- upstream exists
- planned argv arrays
- explicit: `No mutation was performed.`

Do not include the full body unless intentionally capped to a short preview.

### 6. Improve safe command errors

Current errors are too generic:

```text
Command failed: git
Command failed: gh
```

Keep sanitization, but include safe context:

- command name
- argv action, e.g. `git rev-parse`, `gh repo view`
- short sanitized stderr when useful

Do not print:

- tokens
- environment variables
- credential paths
- full config paths if they may reveal secrets

Recommended helper:

```ts
function sanitizeStderr(stderr: string): string {
  // truncate and remove token-like values
}
```

Examples of acceptable errors:

```text
git rev-parse failed: not inside a git repository

gh repo view failed: check GitHub authentication and repository access
```

This should make required failure cases understandable:

- not inside a git repo
- missing origin
- detached HEAD
- non-GitHub origin
- missing gh auth
- wrong cwd

### 7. Keep preview-first mutation gate

Ensure `github_pr_create` still uses:

```ts
if (params.confirm !== true) {
  return preview;
}
```

Do not rely on schema defaults.

Acceptance check: calling `github_pr_create` without `confirm` must never push or create a PR.

### 8. Tighten raw bash `gh` permissions

The current permission config still allows many raw read-only `gh` commands:

- `gh pr list *`
- `gh pr view *`
- `gh repo view *`
- `gh run list *`
- etc.

If the intended behavior is “GitHub operations should use the typed extension,” raw `gh *` should generally be `ask`, with only very narrow exceptions.

Recommended conservative bash rules, respecting last-match-wins:

```jsonc
"gh *": "ask",
"gh auth token*": "deny",
"gh api *": "deny",
"gh repo delete*": "deny",
"gh pr create*": "ask",
"gh pr merge*": "ask"
```

Consider removing automatic allow rules for raw read-only `gh` operations once the typed tools are verified.

Do not blindly replace unrelated permission rules.

### 9. Keep README aligned

Update `.pi/extensions/safe-github/README.md` if implementation details change:

- cwd behavior
- preview argv format
- known limitations
- testing steps

## Verification plan

### Static/load checks

1. Load the extension with a mock `pi` object via `jiti`.
2. Confirm exactly five tools register:
   - `github_auth_status`
   - `github_repo_info`
   - `github_pr_list`
   - `github_pr_view`
   - `github_pr_create`
3. Confirm no `github_pr_merge` or `github_pr_checks` is registered.

### Behavioral checks inside Pi

After `/reload`:

1. Confirm tools appear in available tools.
2. Call `github_auth_status`.
   - Expected: success with username, no token output.
3. Call `github_repo_info` from a GitHub repo.
   - Expected: correct owner/repo/default branch/current branch/URL/root.
4. Call `github_pr_list`.
   - Expected: compact output and no approval prompt.
5. Call `github_pr_view`:
   - with a PR number
   - with a PR URL
   - with neither, from a branch with a PR
   - with both number and URL, expected failure
6. Call `github_pr_create` without `confirm` on a clean feature branch.
   - Expected: preview only, no push, no PR.
   - Preview argv must match actual execution argv.
   - Preview must not include full body.
7. Call `github_pr_create` with `confirm: true` only after explicit user approval in a test branch/repo.
   - Expected: push if needed, PR URL returned.

### Safe failure checks

Verify clear failures for:

- not inside a git repo
- no origin remote
- non-GitHub origin
- detached HEAD
- dirty worktree
- current branch is default branch
- invalid PR number
- invalid PR URL
- omitted `confirm`

### Permission checks

1. In sandboxed bash, verify:
   - `gh api /user --jq .login` is denied by permission-system.
   - `gh auth token` is denied.
2. Confirm raw `gh pr create` and `gh pr merge` still require approval.
3. Confirm typed read-only tools remain allowed.
4. Confirm `github_pr_create` requires tool-level approval if exact tool-name rules are active, and still previews internally if approval rules do not apply.

## Acceptance criteria

- Extension defaults to `ctx.cwd`, not `process.cwd()`.
- TypeScript-level helper calls are consistent.
- `github_pr_view` rejects both number and URL.
- `github_pr_list` validates/caps state and limit in code.
- `github_pr_create` preview is exact, argv-array based, and does not leak the full PR body.
- `github_pr_create` still mutates only when `confirm === true`.
- Errors are safe but actionable.
- Raw bash `gh` access is restricted enough to prefer typed tools.
- README matches implementation.
