---
name: knowledge-stage
description: >-
  Stage a short, substantial knowledge note during a session with the
  kit_knowledge_stage MCP tool. The post-chat hook flushes staged notes to the
  organization store, scoped to this repo. Never the chat transcript.
disable-model-invocation: false
---

# Knowledge stage

Copyright (c) 2026 Devrecated.

Capture **substantial** knowledge as it happens so it becomes company memory,
scoped to this repo and org. Staging is local and incremental; the post-chat
hook flushes what you staged. Do not paste the chat.

Start when the user names this skill, or when something substantial happens in a
session (see below).

## When to stage

Stage a note when one of these actually happened this turn:

- A **decision** was made (an approach chosen, a tradeoff settled).
- A **change** landed that others should know (new route, schema, contract).
- A **blocker** was hit (what is stuck and why).
- A **learning** worth reusing (a non-obvious fact about the codebase or infra).

Do **not** stage on every turn. Skip routine edits, restatements, and small fixes.

## How to stage

Call the local kit MCP tool with the workspace root:

```
kit_knowledge_stage({
  workspace_root: "<repo root>",
  note: "<one short statement>",
  title: "<optional short label>",
  kind: "decision" | "change" | "blocker" | "learning" | "note"
})
```

The tool sanitizes input and records the repo remote and the bound ticket. Check
what is queued with `kit_knowledge_pending`.

## Never stage

- The chat transcript or long pasted logs.
- `.env` values, ID tokens, subscription tokens, mail HTML, or secrets.
- File contents of `.env` or `*admin*.json`.

If the user pasted a secret, stop and ask them to rephrase without it. The tool
strips obvious tokens, but do not rely on that.

## Close

Tell the user the note was staged and will be flushed after the chat. Do not
start other work from this skill.
