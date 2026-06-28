# @amitkot/pi-permission-tune

Pi skill for maintaining `@gotgenes/pi-permission-system` config.

## What it provides

- `permission-tune` skill: reference for when Pi stops on a permission prompt and you need to add or adjust allow/deny rules for bash commands, paths, external directories, or tools.

## What it covers

- Config structure and rule matching order
- Wildcard pattern semantics (including why `"cmd *"` covers bare `cmd`)
- Prompt-to-rule workflow: identify surface → classify risk → add narrowest rule → validate → reload
- Safe bash rules to allow (read-only helpers, discovery commands)
- Rules that should stay ask/deny (`rm`, `git push`, `curl`, `env`, `sudo`, etc.)
- Path deny patterns for secrets (`.env`, SSH keys, cloud credentials, etc.)
- `external_directory` vs `path` usage

## Usage

```text
/skill:permission-tune
```

Or let Pi auto-load it when a permission-related task comes up.

## Requirements

- Pi with `@gotgenes/pi-permission-system` extension installed

## License

MIT
