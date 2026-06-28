---
name: permission-tune
description: Maintain Pi's @gotgenes/pi-permission-system config. Use when Pi stops on a permission prompt and you need to add or adjust bash, path, external_directory, or tool allow/deny rules. Covers pattern matching, safe vs dangerous commands, and the workflow for narrowing rules.
---

# Permission Tune

Reference for maintaining the `@gotgenes/pi-permission-system` extension config.

## Config location

The active config is at:
```
~/.pi/agent/extensions/pi-permission-system/config.json
```

It's fine to edit this file directly. If you keep your config in a dotfiles repo, consider symlinking so changes persist across setups.

## Config shape

- Top-level `permission` key, flat structure.
- Permission states: `allow`, `ask`, `deny`.
- A surface can be a string shorthand or a pattern map:
  - `"read": "allow"`
  - `"bash": { "*": "ask", "git status": "allow" }`

## Rule matching order

In a pattern map, **last matching rule wins**. Place broad catch-alls first, specific overrides later.

For composed checks, more restrictive gates can still stop a call. Order:
1. `path` cross-cutting rules
2. `external_directory` CWD-boundary rules
3. per-tool rules
4. `bash` command patterns

## Wildcard pattern semantics

- `*` matches across text, including spaces.
- **A pattern ending in ` *` also matches the bare command.** For example, `"date *"` covers both `date` and `date +%Y`. **Never add a bare-key duplicate** of a `"<cmd> *"` rule — it's redundant and bloats the config.
- Bash commands are parsed into command units. In a chained command, the prompt may show one subcommand plus the full command. Add rules for the subcommand that matched `*`, not necessarily the whole chain.

## Workflow when Pi stops on a permission prompt

When Pi shows a permission prompt:

1. **Identify the surface** — usually `bash`, a tool name, `path`, or `external_directory`.
2. **Identify why it prompted:**
   - `(matched '*')` — no more specific rule matched.
   - `which references path(s) outside working directory` — `external_directory` prompted.
3. **Decide whether a persistent rule is safe:**
   - Safe read-only shell utilities: add narrowly scoped `allow`.
   - Mutating, network, credential, privilege, process, or destructive commands: keep `ask` or `deny`.
4. **Edit the config** with the narrowest useful rule. Use the `<cmd> *` form (not a bare-key duplicate).
5. **Preserve existing deny rules** and keep new allow rules before later dangerous overrides only when order requires it.
6. **Validate JSON** after editing.
7. Tell the user to run `/reload` or restart Pi.

## Safe bash rules to allow

Read-only agent flow helpers — use the `"<cmd> *"` form only (covers bare command too):

```json
"printf *": "allow",
"test *": "allow",
"uname *": "allow",
"date *": "allow",
"sleep *": "allow"
```

Command-discovery helpers:

```json
"which *": "allow",
"command -v *": "allow"
```

For shell `command` wrappers, do **not** add broad `"command *": "allow"` — it could allow `command rm ...` or other commands that should stay gated. Only `command -v *` is safe (read-only discovery). If a model repeatedly emits `command rtk ...`, treat that as a prompt/style problem first.

For project inspection pipelines, allow the individual commands Pi parses, not the entire pipeline:

```json
"find *": "allow",
"sort *": "allow",
"sed *": "allow",
"head *": "allow",
"printf *": "allow"
```

## Rules that stay ask/deny

Keep or add `ask`/`deny` for:

- `rm`, `git reset`, `git clean`, `git push`, `git checkout`, `git restore`
- package publishing or installing global executables
- `sudo`, `chmod -R`, `chown -R`
- network commands (`curl`, `wget`, `http`, `xh`) unless scoped to a trusted read-only use
- `env`, `printenv`, `gh auth token`, raw `gh api`
- Docker/podman access and `/var/run/docker.sock`
- anything touching `.env`, private keys, cloud credentials, `.npmrc`, `.netrc`, or git credentials

## Path denies (global, cross-cutting)

`path` denies protect secrets globally. Do not loosen them casually:

```json
".env": "deny",
".env.*": "deny",
"**/.env": "deny",
".npmrc": "deny",
"*.pem": "deny",
"*.key": "deny",
"~/.ssh/*": "deny",
"~/.aws/*": "deny",
"~/.gnupg/*": "deny",
"~/.config/gcloud/*": "deny",
"~/.docker/config.json": "deny",
"~/.netrc": "deny",
"~/.git-credentials": "deny",
"/var/run/docker.sock": "deny"
```

## external_directory

`external_directory` is the right place to allow known safe directories outside the working tree. Do not use `path` to bypass external-directory prompts.

## Editing policy

- Use exact, minimal edits. Do not reformat the whole JSON unless asked.
- Place related bash allows near similar read-only shell utility rules.
- Do not change extension source under `node_modules` unless explicitly patching or studying the package.
