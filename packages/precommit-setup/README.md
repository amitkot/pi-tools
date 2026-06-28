# @amitkot/pi-precommit-setup

Pi command for adding a practical pre-commit setup to Rust and Python repositories.

## What it provides

- `/add-precommit` command: writes `.pre-commit-config.yaml` in the current Git repository.
- Rust profile: `cargo fmt` and `cargo clippy`.
- Python profile: Ruff lint fixes and Ruff formatting.
- Common hooks: whitespace, EOF, YAML/TOML/JSON syntax, merge conflicts, large files, symlinks, executable/shebang checks, case conflicts, private keys, and typo checks.

## Usage

```text
/add-precommit rust
/add-precommit python
/add-precommit rust python
/add-precommit
```

With no profile arguments, the command detects `Cargo.toml` for Rust and common Python files such as `pyproject.toml`, `setup.py`, `setup.cfg`, or `requirements.txt`.

Options:

```text
--no-install   Write the config but do not install the Git hook
--force        Overwrite an existing .pre-commit-config.yaml
--overwrite    Alias for --force
```

By default, the command installs the Git hook with `prek install` when `prek` is available, otherwise with `pre-commit install` when `pre-commit` is available. If neither runner is found, it writes the config and tells you how to install the hook later.

## Notes

- Existing pre-commit configs are not merged. Re-run with `--force` only when replacing the file is intended.
- The Rust profile uses `cargo clippy --workspace --all-targets --all-features -- -D warnings`. Some workspaces with mutually exclusive features may need to edit that hook.
- Periodically update hook versions with `prek autoupdate` or `pre-commit autoupdate`.
