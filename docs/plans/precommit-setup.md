# Pre-commit setup command

## Scope

Add a Pi command that creates a `.pre-commit-config.yaml` in the current Git repository for Rust and/or Python projects.

## Non-goals

- Do not merge into existing pre-commit configs. If a config exists, stop unless explicitly forced.
- Do not infer or edit project-specific lint/type-check settings such as `mypy`, feature flags beyond the default Rust command, or Ruff rule choices.
- Do not install package managers or hook runners.

## Acceptance criteria

- A command is registered as `/add-precommit`.
- The command supports Rust and Python profiles: `rust`, `python`, or both.
- With no explicit profile, it detects common Rust/Python project files.
- It writes a pinned `.pre-commit-config.yaml` with common safety hooks plus profile-specific hooks.
- It installs the Git hook with an available runner (`prek` preferred, then `pre-commit`) unless `--no-install` is supplied.
- Existing pre-commit configs are not overwritten unless `--force`/`--overwrite` is supplied.
- Tests cover argument parsing, profile detection, config generation, and command registration.

## Tool choices

- Common hooks: `pre-commit/pre-commit-hooks` for whitespace, file syntax, merge-conflict, large-file, symlink, executable, case-conflict, and private-key checks.
- Common spell check: `crate-ci/typos`, report-only (`args: []`) to avoid automatic typo rewrites.
- Python: Ruff (`astral-sh/ruff-pre-commit`) for lint fixes and formatting. Avoid Black/isort/pyupgrade because Ruff covers the usual formatter/import/modernization path with less duplication.
- Rust: local `cargo fmt --all -- --check` and `cargo clippy --workspace --all-targets --all-features -- -D warnings`. These rely on the repository's Rust toolchain and avoid third-party Rust hook mirrors.

## Risks

- `cargo clippy --all-features` can fail in crates with mutually exclusive features; users may need to edit the generated config.
- Hook versions age; users should periodically run `pre-commit autoupdate` or `prek autoupdate`.
- `prek install` compatibility is assumed from its pre-commit-compatible CLI. If unavailable, the command falls back to `pre-commit` or writes config only.
