# open-zed extension

Opens files in the Zed IDE from Pi, bypassing macOS sandbox restrictions.

## Purpose

The sandboxed bash tool cannot run `zed` (like `gh`). This extension calls `zed` on
the host via `child_process.execFile`, so the LLM can open files for the user's
inspection or editing in their IDE.

## Threat Model

- **Risk**: Accidental file opens, minimal.
- **Mitigations**:
  - Uses `child_process.execFile` with argument arrays (no shell).
  - Adds execution timeout.
  - Does not pass full process environment to subprocesses.
  - Only opens files — no edits, no mutations.

## Requirements

- [Zed IDE](https://zed.dev) installed on the host machine
- `zed` available on `PATH`

## Tools

- `open_zed` — opens a file in Zed, optionally at a specific line number

### Parameters

- `path` (required) — file path to open
- `line` (optional) — line number to navigate to (1-indexed)

## Prompt Guidelines

- Use `open_zed` when the user asks to open or edit a file in their Zed IDE.
- Do not use raw `zed` shell commands when this tool is available.

## Installation

From the monorepo:

```bash
pi install git:github.com/amitkot/pi-tools
```

For local development from a checkout:

```bash
pi -e ./packages/open-zed/src/index.ts
```

After installation or changes, restart Pi or run:

```text
/reload
```
