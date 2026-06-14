# Safe GitHub extension required changes

## Scope

Bring `.pi/extensions/safe-github` from prototype to a safe, loadable v1 Pi extension.

V1 should implement only:

- `github_auth_status`
- `github_repo_info`
- `github_pr_list`
- `github_pr_view`
- `github_pr_create`

Defer `github_pr_checks` and `github_pr_merge` until the core tools load and pass real tests.

## Current blockers

1. The extension likely does not load.
   - It imports `Type` from `@earendil-works/pi-typebox`, which is not installed.
   - Pi examples use `import { Type } from "typebox"`.

2. Tools are registered with the wrong API shape.
   - Current code calls `pi.registerTool("name", fn)`.
   - Pi expects `pi.registerTool({ name, label, description, parameters, execute })`.

3. Mutating tools are unsafe by default.
   - Current code previews only when `confirm === false`.
   - If `confirm` is omitted, mutation executes.
   - Required behavior: preview unless `confirm === true`.

4. Repository parsing is broken.
   - Current GitHub remote regex captures only the owner for common HTTPS remotes.
   - Must support HTTPS, SSH scp-style, and `ssh://` GitHub remotes.

5. Some `gh` invocations are probably invalid.
   - `gh pr view --number ...` and `gh pr checks --number ...` should use positional selectors.
   - Re-check JSON field names against the installed `gh` version.

6. `git push` is wrong for branches with upstream.
   - Current code runs `git push CURRENT_BRANCH`, treating the branch as a remote.
   - Use `git push` for existing upstream or `git push -u origin CURRENT_BRANCH` for no upstream.

7. Permission-system config has not been tightened.
   - `gh api *` is currently ask, not deny.
   - `gh auth token*` is not denied.
   - Tool-level rules for `github_pr_create` / `github_pr_merge` are not configured.

8. Merge is too risky for v1.
   - Current merge implementation does not fail closed on draft/open/check/mergeability state.
   - Remove or disable until implemented with full safeguards.

## Required implementation changes

### 1. Fix extension imports

- Replace `@earendil-works/pi-typebox` with `typebox`.
- Remove unused imports.

### 2. Register real Pi tools

Each tool must use the documented form:

```ts
pi.registerTool({
  name: "github_repo_info",
  label: "GitHub Repo Info",
  description: "Show the current GitHub repository identity.",
  parameters: Type.Object({ ... }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    return {
      content: [{ type: "text", text: markdown }],
      details: { ...machineReadableData },
    };
  },
});
```

Add `promptSnippet` and `promptGuidelines`, including:

- Use `github_pr_create` instead of `gh pr create`.
- If the user explicitly asks to create a PR, call `github_pr_create` with `confirm: true`; the Pi permission prompt is the approval gate.
- Use `confirm: false` when the user asks for a preview or the request is ambiguous.
- Do not use raw `gh api`, `gh auth token`, or shell for GitHub operations when these tools are available.

### 3. Make confirmation fail closed

For every mutating tool:

```ts
if (params.confirm !== true) {
  return preview;
}
```

Do not rely on omitted `confirm` being false after schema validation.

### 4. Harden command execution

- Use `execFile` only.
- Add a timeout.
- Keep `maxBuffer` bounded.
- Return sanitized errors.
- Do not include environment variables, credential paths, or tokens in errors.
- Keep argv previews clear, but avoid shell-style strings.

### 5. Fix repository detection

`getRepoInfo(cwd)` should:

1. Run `git rev-parse --show-toplevel`.
2. Run `git remote get-url origin`.
3. Run `git branch --show-current`.
4. Fail on detached HEAD.
5. Parse GitHub remotes from:
   - `https://github.com/OWNER/REPO.git`
   - `https://github.com/OWNER/REPO`
   - `git@github.com:OWNER/REPO.git`
   - `ssh://git@github.com/OWNER/REPO.git`
6. Run `gh repo view OWNER/REPO --json nameWithOwner,defaultBranchRef,url`.
7. Return owner, repo, default branch, current branch, URL, and worktree root.

Fail closed if origin is not GitHub or parsing is ambiguous.

### 6. Implement v1 tools only

#### `github_auth_status`

- Run `gh auth status`.
- Run `gh api /user --jq .login`.
- Return username and success/failure.
- Do not run `gh auth token`.
- Do not print tokens.

#### `github_repo_info`

- Use hardened `getRepoInfo`.
- Return markdown and JSON details.

#### `github_pr_list`

- Validate `state` as `open | closed | merged | all`.
- Default `limit` to 20 and cap at 50.
- Use:
  - `gh pr list --state STATE --limit LIMIT --json number,title,state,isDraft,headRefName,baseRefName,url,author,updatedAt`
- Include compact markdown plus JSON details.

#### `github_pr_view`

- Accept optional `number` or `url`, not both.
- If neither is provided, view current branch PR.
- Use positional selector when provided:
  - `gh pr view NUMBER --json ...`
  - `gh pr view URL --json ...`
- Verify JSON fields against installed `gh`.
- Include title, body, state, draft status, base/head, URL, reviews, checks summary, and changed files if supported.
- Truncate large body/output.

#### `github_pr_create`

- Required inputs: `title`, `body`.
- Optional: `base`, `draft`, `confirm`, `cwd`.
- Validate repo and current branch.
- Refuse default branch.
- Refuse dirty worktree.
- Check upstream with `git rev-parse --abbrev-ref --symbolic-full-name @{u}`.
- If `confirm !== true`, return preview only:
  - repo
  - current branch
  - base
  - title
  - body length, not full body unless short
  - draft flag
  - exact argv plan
  - explicit “no mutation was performed” message
- If confirmed:
  - push with `git push -u origin CURRENT_BRANCH` only if no upstream exists
  - otherwise use `git push` or skip push; prefer `git push` only if intentional
  - create PR with `gh pr create --title TITLE --body BODY --base BASE` plus optional `--draft`
  - return PR URL

### 7. Defer or remove merge in v1

Do not expose `github_pr_merge` until it can enforce:

- PR is open.
- PR is not draft.
- Checks are passing or explicitly acceptable.
- Mergeability is known.
- Repo is unambiguous.
- Preview-first confirmation works.

No override in v1.

### 8. Update permission-system config

Update `~/.pi/agent/extensions/pi-permission-system/config.json` or the appropriate project config with the intended policy.

Bash `gh` rules should include, with correct ordering for last-match-wins:

```jsonc
"bash": {
  "*": "allow",
  "gh *": "ask",
  "gh auth token*": "deny",
  "gh repo delete*": "deny",
  "gh api *": "deny",
  "gh pr create*": "ask",
  "gh pr merge*": "ask"
}
```

Adapt this into the existing broader config rather than replacing unrelated rules blindly.

If tool-level permissions are supported, add:

```jsonc
"tools": {
  "github_auth_status": "allow",
  "github_repo_info": "allow",
  "github_pr_list": "allow",
  "github_pr_view": "allow",
  "github_pr_create": "ask",
  "github_pr_merge": "ask"
}
```

If exact tool-name matching does not work, rely on the internal `confirm !== true` guard and preview output.

## Verification plan

1. Reload Pi and confirm the extension loads.
2. Confirm all v1 tools appear in the available tools list.
3. In normal sandboxed bash, run:
   - `gh api /user --jq .login`
   - Expected sandbox TLS failure, if the original issue remains.
4. Call `github_auth_status`.
   - Expected success and GitHub username.
   - No token output.
5. Call `github_repo_info`.
   - Expected correct owner/repo/default branch/current branch/repo URL/worktree root.
6. Call `github_pr_list`.
   - Expected compact output, no approval prompt.
7. Call `github_pr_view` for a known PR and current branch PR.
8. On a clean feature branch, call `github_pr_create` with `confirm: false`.
   - Expected preview only.
   - No push.
   - No PR created.
9. After an explicit create request, call `github_pr_create` with `confirm: true` in a test repo/branch and approve the Pi permission prompt.
   - Expected push if needed.
   - Expected PR URL.
   - No TLS failure.
10. Verify safe failures:
    - default branch refuses
    - dirty worktree refuses
    - detached HEAD refuses
    - non-GitHub origin refuses
    - invalid cwd refuses
    - omitted `confirm` does not mutate
    - `gh auth token` is not available through any tool

## Acceptance criteria

- `/reload` loads the extension successfully.
- All v1 tools are visible and callable.
- `github_auth_status` succeeds from the extension process.
- `github_repo_info` returns correct repo identity.
- `github_pr_list` and `github_pr_view` work without approval.
- `github_pr_create` previews by default and mutates only with `confirm: true` after the Pi permission prompt is approved.
- No arbitrary `gh` command or raw `gh api` tool is exposed.
- No tokens are printed.
- All process execution uses argv arrays, never shell strings.
- Wrong repo, wrong branch, dirty worktree, detached HEAD, and ambiguous state fail closed.
