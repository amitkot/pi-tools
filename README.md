# Pi Tools

[![CI](https://github.com/amitkot/pi-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/amitkot/pi-tools/actions/workflows/ci.yml)
[![npm: @amitkot/pi-safe-github](https://img.shields.io/npm/v/%40amitkot%2Fpi-safe-github?label=%40amitkot%2Fpi-safe-github)](https://www.npmjs.com/package/@amitkot/pi-safe-github)
[![npm: @amitkot/pi-open-zed](https://img.shields.io/npm/v/%40amitkot%2Fpi-open-zed?label=%40amitkot%2Fpi-open-zed)](https://www.npmjs.com/package/@amitkot/pi-open-zed)
[![npm: @amitkot/pi-precommit-setup](https://img.shields.io/npm/v/%40amitkot%2Fpi-precommit-setup?label=%40amitkot%2Fpi-precommit-setup)](https://www.npmjs.com/package/@amitkot/pi-precommit-setup)
[![npm: @amitkot/pi-permission-tune](https://img.shields.io/npm/v/%40amitkot%2Fpi-permission-tune?label=%40amitkot%2Fpi-permission-tune)](https://www.npmjs.com/package/@amitkot/pi-permission-tune)
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

Tools include repo/branch info, PR list/view/checks/files/diff/create/edit/comment/review/merge, workflow run list/view/logs/rerun/cancel, commit status, issues, workflows, and releases. See the package README for the exact tool names.

See [`packages/safe-github/README.md`](packages/safe-github/README.md) for details.

### `open-zed`

Path: `packages/open-zed/`

Opens files in the Zed IDE from Pi.

Tools: `open_zed`.

See [`packages/open-zed/README.md`](packages/open-zed/README.md) for details.

### `deliver-code-changes`

Path: `packages/deliver-code-changes/`

Runs a one-gate delivery workflow for completed code changes.

Command: `/deliver`. Skill: `deliver-code-changes`.

See [`packages/deliver-code-changes/README.md`](packages/deliver-code-changes/README.md) for details.

### `precommit-setup`

Path: `packages/precommit-setup/`

Adds a Rust and/or Python `.pre-commit-config.yaml` to the current Git repository.

Command: `/add-precommit`.

See [`packages/precommit-setup/README.md`](packages/precommit-setup/README.md) for details.

### `permission-tune`

Path: `packages/permission-tune/`

Reference skill for maintaining `@gotgenes/pi-permission-system` config. Covers pattern matching, safe vs dangerous commands, and the prompt-to-rule workflow.

Skill: `permission-tune`.

See [`packages/permission-tune/README.md`](packages/permission-tune/README.md) for details.

## Installation

### As a Pi package

```bash
pi install git:github.com/amitkot/pi-tools
```

Or install individual packages:

```bash
pi install npm:@amitkot/pi-safe-github
pi install npm:@amitkot/pi-open-zed
pi install npm:@amitkot/pi-deliver-code-changes
pi install npm:@amitkot/pi-precommit-setup
pi install npm:@amitkot/pi-permission-tune
```

After installation, restart Pi or run `/reload`.

### Local development

From a checkout, load an extension directly:

```bash
pi -e ./packages/safe-github/src/index.ts
pi -e ./packages/open-zed/src/index.ts
pi -e ./packages/deliver-code-changes/src/index.ts
pi -e ./packages/precommit-setup/src/index.ts
```

Inside this repo, Pi auto-loads the project-local shims at `.pi/extensions/<name>/index.ts` after the project is trusted.

## Requirements

- Pi with extension support
- For `safe-github`: GitHub CLI (`gh`) installed and authenticated (`gh auth status`)
- For `open-zed`: Zed IDE installed, `zed` on `PATH`
- For `deliver-code-changes`: Git, GitHub CLI (`gh`) authenticated, and repo checks available
- For `precommit-setup`: Git, and optionally `prek` or `pre-commit` to install and run hooks
- For `permission-tune`: `@gotgenes/pi-permission-system` extension installed

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
  deliver-code-changes/
  precommit-setup/
  permission-tune/
.pi/extensions/
  safe-github/              # local development shim
  open-zed/                 # local development shim
  deliver-code-changes/     # local development shim
  precommit-setup/          # local development shim
docs/
  plans/
```

New packages go under `packages/<name>/` with their own README, `package.json`, and `src/index.ts`. Pure skill packages (like `permission-tune`) omit `src/index.ts`.

## Security model

Pi extensions run with host permissions. Every package in this repo prefers narrow typed tools over generic command execution:

- no arbitrary shell command tools
- subprocesses use `execFile` with argv arrays, not shell strings
- mutating tool operations are gated by `confirm: true` and Pi's permission prompt
- `/deliver` runs mutating Git and GitHub operations only after one explicit extension confirmation
- command output is bounded and sanitized
- no token-exposing tools

See [`SECURITY.md`](SECURITY.md) for reporting and policy details.

## License

MIT. See [`LICENSE`](LICENSE).
