# Public readiness checklist

This checklist tracks what is needed for `pi-tools` to be comfortable to share publicly.

## Done

- [x] Avoid committing secrets or local credential files.
- [x] Keep the GitHub bridge narrow and typed rather than exposing a host shell.
- [x] Add a monorepo-friendly `packages/` layout.
- [x] Keep a `.pi/extensions/` shim for local project development.
- [x] Add root README problem framing and install instructions.
- [x] Add package-level README for `safe-github`.
- [x] Add `LICENSE`.
- [x] Add `SECURITY.md`.
- [x] Add `CONTRIBUTING.md`.
- [x] Add `CHANGELOG.md`.
- [x] Add CI workflow.
- [x] Add basic tests for helper behavior and tool registration.

## Still useful later

- [ ] Publish tagged releases.
- [ ] Add screenshots or sample Pi tool-call output.
- [ ] Add more tests around preview generation and command error sanitization.
- [ ] Add additional packages only when they have a similarly narrow threat model.
- [ ] Revisit `docs/plans/` before a major public announcement; keep design docs factual and remove obsolete implementation notes if they become confusing.
