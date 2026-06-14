# Pi Tools

[![CI](https://github.com/amitkot/pi-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/amitkot/pi-tools/actions/workflows/ci.yml)
[![npm: @amitkot/pi-safe-github](https://img.shields.io/npm/v/%40amitkot%2Fpi-safe-github?label=%40amitkot%2Fpi-safe-github)](https://www.npmjs.com/package/@amitkot/pi-safe-github)
[![npm: @amitkot/pi-open-zed](https://img.shields.io/npm/v/%40amitkot%2Fpi-open-zed?label=%40amitkot%2Fpi-open-zed)](https://www.npmjs.com/package/@amitkot/pi-open-zed)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js >=22](https://img.shields.io/badge/node-%3E%3D22-339933.svg)](package.json)
[![Security policy](https://img.shields.io/badge/security-policy-lightgrey.svg)](SECURITY.md)

A monorepo for Pi extensions.

## Status

Early-stage, narrow host-side tools for Pi. Review the package source before installing, because Pi extensions run with host permissions.

## Problem

On macOS, Pi's sandboxed `bash` tool can fail when calling some host binaries directly. For example, `gh` can hit TLS certificate verification errors, and GUI tools such as `zed` may not be available from the sandbox. The blunt fixes are unattractive:

- do not disable the sandbox for all commands
- do not loosen the sandbox around macOS trust services
- do not give the model arbitrary host shell access

Each package in this repo registers a small set of typed Pi tools that run from the Pi extension process on the host Mac. Normal commands stay sandboxed. Host-bridge operations use a narrow, audited surface.

## Packages

### `safe-github`

Path: `packages/safe-github/`

Typed GitHub operations via the host `gh` CLI.

Tools: `github_auth_status`, `github_repo_info`, `github_pr_list`, `github_pr_view`, `github_pr_create`.

See [`packages/safe-github/README.md`](packages/safe-github/README.md) for details.

### `open-zed`

Path: `packages/open-zed/`

Opens files in the Zed IDE from Pi.

Tools: `open_zed`.

See [`packages/open-zed/README.md`](packages/open-zed/README.md) for details.

## Installation

### As a Pi package

```bash
pi install git:github.com/amitkot/pi-tools
```

Or install individual packages:

```bash
pi install npm:@amitkot/pi-safe-github
pi install npm:@amitkot/pi-open-zed
```

After installation, restart Pi or run `/reload`.

### Local development

From a checkout, load an extension directly:

```bash
pi -e ./packages/safe-github/src/index.ts
pi -e ./packages/open-zed/src/index.ts
```

Inside this repo, Pi auto-loads the project-local shims at `.pi/extensions/<name>/index.ts` after the project is trusted.

## Requirements

- Pi with extension support
- For `safe-github`: GitHub CLI (`gh`) installed and authenticated (`gh auth status`)
- For `open-zed`: Zed IDE installed, `zed` on `PATH`

## Development

```bash
npm install
npm run check
npm test
```

## Repository layout

```text
packages/
  safe-github/
  open-zed/
.pi/extensions/
  safe-github/       # local development shim
  open-zed/           # local development shim
docs/
  plans/
```

New packages go under `packages/<name>/` with their own README, `package.json`, and `src/index.ts`.

## Security model

Pi extensions run with host permissions. Every package in this repo prefers narrow typed tools over generic command execution:

- no arbitrary shell command tools
- subprocesses use `execFile` with argv arrays, not shell strings
- mutating operations are gated by `confirm: true` and Pi's permission prompt
- command output is bounded and sanitized
- no token-exposing tools

See [`SECURITY.md`](SECURITY.md) for reporting and policy details.

## License

MIT. See [`LICENSE`](LICENSE).
