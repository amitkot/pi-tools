# Plan: safe PR metadata editing

## Problem

`safe-github` can create, list, and view pull requests, but it cannot edit an existing PR title or body. When a PR description is wrong, the agent currently has to ask the user to fix it manually in GitHub.

## Goal

Add a narrow `github_pr_edit` tool for updating existing PR metadata without exposing raw `gh` or `gh api`.

## Scope

- Edit PR title and/or body.
- Select PR by number, URL, or current branch.
- Use `gh pr edit` through `execFile` argv arrays.
- Require Pi tool permission approval for mutation.
- Keep output compact: show PR number, title, URL, and which fields changed.

## Non-goals

- No arbitrary `gh pr edit` flags.
- No label, milestone, reviewer, assignee, project, or base-branch edits in the first version.
- No raw GitHub API access.
- No token exposure.

## Proposed tool

```ts
github_pr_edit({
  number?: number,
  url?: string,
  title?: string,
  body?: string,
  cwd?: string,
})
```

Validation:

- Require at least one selector: `number`, `url`, or infer current branch PR.
- Reject both `number` and `url` if they refer to different PRs or create ambiguity.
- Require at least one field to update: `title` or `body`.
- Trim and reject empty `title` / `body` when provided.
- Validate PR URLs with the existing GitHub PR URL helper.

## Approval model

`github_pr_edit` is mutating. The Pi permission prompt is the approval gate.

The tool should not require a separate preview/confirm parameter. If a preview is useful later, add it as an explicit `preview?: boolean` option, not as mandatory ceremony.

## Implementation notes

- Reuse repository detection and PR selector behavior from `github_pr_view` where possible.
- Build argv explicitly, for example:

```ts
["pr", "edit", selector, "--title", title, "--body", body]
```

- Redact or omit full PR body from any diagnostic preview/log output.
- Keep error sanitization consistent with existing `run()` handling.

## Tests

- Registers expected tool name.
- Rejects missing update fields.
- Rejects empty title/body.
- Rejects invalid PR URL.
- Builds expected argv for title-only, body-only, and title+body edits if command construction is factored for testing.

## Docs

- Add `github_pr_edit` to `packages/safe-github/README.md`.
- Update root README tool list.
- Update `SECURITY.md` mutation notes if needed.
- Add a changelog entry.

## Acceptance criteria

- `npm run check` passes.
- `npm test` passes.
- `github_pr_edit` can update a PR body in a test repository through `gh pr edit`.
- No raw `gh api`, `gh auth token`, or shell execution is exposed.
