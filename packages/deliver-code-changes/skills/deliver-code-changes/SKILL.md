---
name: deliver-code-changes
description: Use when the user asks to deliver, submit, commit, or open a PR for completed code changes. Guides the agent to review docs/changelog/env implications and then invoke /deliver for the one-gate delivery workflow.
---

# Deliver Code Changes

Before invoking `/deliver`:

- Confirm the requested implementation is complete.
- Confirm relevant verification has already passed or will be run by `/deliver`.
- Review whether docs, changelog, `.env.example`, migrations, config examples, or security notes need updates.
- Do not invoke `/deliver` if known acceptance criteria are unmet.

When ready, invoke `/deliver` and provide a concise commit/PR title if the user supplied one.
