# Pi Tools

A monorepo for Pi extensions and related tools.

The first package is `safe-github`, a narrow host-side GitHub bridge for Pi.

## Problem this solves

On macOS, Pi's normal `bash` tool can run inside a sandbox. That is good for day-to-day development commands, but it can break stock `gh` in some environments with TLS certificate verification errors such as:

```text
tls: failed to verify certificate: x509: OSStatus -26276
```

The blunt fixes are unattractive:

- do not rebuild `gh`
- do not disable the sandbox for all commands
- do not loosen the sandbox around macOS trust services
- do not give the model arbitrary host shell access
- do not expose raw `gh api` or `gh auth token`

`safe-github` solves this by registering a small set of typed Pi tools that run from the Pi extension process on the host Mac. Normal commands still use Pi's usual sandboxed tools. GitHub operations use a narrow, audited surface.

## Packages

### `safe-github`

Path: `packages/safe-github/`

Project-local development shim: `.pi/extensions/safe-github/index.ts`

Available v1 tools:

- `github_auth_status` — verify host `gh` authentication
- `github_repo_info` — show the current repository identity
- `github_pr_list` — list pull requests
- `github_pr_view` — inspect a pull request
- `github_pr_create` — create a pull request after preview and explicit confirmation

Mutating operations are preview-first: `github_pr_create` does not push or create a PR unless called with `confirm: true`.

See [`packages/safe-github/README.md`](packages/safe-github/README.md) for details.

## Installation

### Use this repo as a Pi package

```bash
pi install git:github.com/amitkot/pi-tools
```

Then restart Pi or run:

```text
/reload
```

### Try locally from a checkout

```bash
git clone https://github.com/amitkot/pi-tools.git
cd pi-tools
pi -e ./packages/safe-github/src/index.ts
```

### Develop inside this repo

This repo also contains a project-local Pi extension shim at `.pi/extensions/safe-github/index.ts`, so Pi can auto-load it from a trusted checkout.

After changes:

```text
/reload
```

## Requirements

- Pi with extension support
- Node.js 22+ for local tests
- GitHub CLI (`gh`) installed on the host
- Host `gh` authenticated:

```bash
gh auth status
gh api /user --jq .login
```

Do not use `gh auth token` for verification.

## Development

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run check
npm test
```

## Repository layout

```text
packages/
  safe-github/
    src/index.ts
    README.md
    package.json
.pi/extensions/
  safe-github/
    index.ts       # local development shim
docs/
  plans/           # planning notes and public-readiness checklist
```

Future Pi plugins should live under `packages/<plugin-name>/` with their own README, package manifest, and `src/index.ts`.

## Security model

Pi extensions run with host permissions. This repo prefers narrow typed tools over generic command execution.

For `safe-github`:

- no arbitrary `gh` command tool
- no raw `gh api` tool
- no `gh auth token` tool
- subprocesses use `execFile` with argv arrays, not shell strings
- mutating operations require explicit confirmation
- command output and errors are bounded and sanitized

See [`SECURITY.md`](SECURITY.md) for reporting and policy details.

## License

MIT. See [`LICENSE`](LICENSE).
