# Pi Tools

Project-local Pi extensions and related tooling.

## Extensions

### safe-github

Path: `.pi/extensions/safe-github/`

`safe-github` provides a narrow, typed GitHub bridge for Pi. It lets Pi perform common GitHub operations through the host `gh` CLI while normal development commands continue to use the sandboxed bash tool.

The extension intentionally does **not** expose arbitrary `gh` execution, raw `gh api`, or `gh auth token`.

Available v1 tools:

- `github_auth_status` — verify host `gh` authentication
- `github_repo_info` — show the current repository identity
- `github_pr_list` — list pull requests
- `github_pr_view` — inspect a pull request
- `github_pr_create` — create a pull request after preview and explicit confirmation

Mutating operations are preview-first: `github_pr_create` does not push or create a PR unless called with `confirm: true`.

See `.pi/extensions/safe-github/README.md` for the threat model, approval model, and testing steps.
