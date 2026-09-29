# Kit hooks

Copyright (c) 2026 Devrecated.

Same layout as skills: `autodevelop/` vs the consumer instance folder vs `third-party/`. Cursor does not scan these folders; [`.cursor/hooks.json`](../hooks.json) (template: [hooks.json](../../hooks.json) at the kit root) lists each command path.

Process hooks must not emit `followup_message`. Use `additional_context` so the agent asks in the same reply. `worktree-status` records a footer on linked worktrees; turn hooks off with `hookignore.yaml` (see `hookignore.example.yaml`).

Preview-project denylists come from instance `forbiddenProjects`. Session intro text comes from optional `<instance>/session-context.md`.
