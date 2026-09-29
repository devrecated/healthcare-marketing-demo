---
name: create-skill-brain
description: >-
  Reorganizes how Autodevelop Brain skills are linked in skill-catalog.yaml —
  buckets, loops, related edges, invoke mode, and slash wrappers. Companion to
  Cursor /create-skill. Use when the user types /create-skill-brain or asks to
  move a skill between buckets, reorder a loop, or retarget related skills.
  Operator-only — does not author a new Brain body unless also asked.
disable-model-invocation: true
---

# Create skill brain (link / reorganize)

Copyright (c) 2026 Devrecated.

Operator playbook. Lives under `autodevelop-internal` (see `internal-skills` rule). Companion to Cursor `/create-skill`: **linking only** unless the user also asks to author (then call `/brain-add-skill`).

Do **not** copy this skill into `services/brain/skills/`. Do **not** add it to `mcp_buckets` or `loops`.

Catalog field cheat sheet: [reference.md](reference.md).

## 1. Inventory

For each named skill, read both catalog copies and report:

- Which `mcp_buckets.<id>.may_invoke` lists it
- Which `loops.*.steps` / `optional` / `resume_from` mention it
- `skills[]` row: `related`, `depends_on`, `gates`, `when`, `invoke`
- `wrappers` that pin a bucket or loop
- `skill-invoke.yaml` manual vs automatic

## 2. Apply the reorg

Edit both identical copies:

- `.cursor/skills/autodevelop-internal/skill-catalog.yaml`
- `kits/cursor/skills/autodevelop-internal/skill-catalog.yaml`

And `skill-invoke.yaml` (+ kits) when invoke mode changes.

Allowed moves:

- Add/remove from `mcp_buckets.*.may_invoke`; adjust `when` keywords if routing breaks
- Reorder `loops.*.steps`; move names between `optional` and required
- Retarget `related` / `depends_on` on the `skills:` row
- Change `invoke` in catalog + `skill-invoke.yaml`
- Point a `wrappers` entry at a different bucket or loop (keep `.cursor/commands/` file in sync)

## 3. Invariants

From the MCP buckets ADR and `docs/internal/flows/loops.md`:

- Eight buckets only — never invent a ninth
- Loops never satisfy gates (`gate_class` is a warning, not a send/deploy)
- `resume_from` must stay idempotent (do not restart at create-ticket after a bind)
- Mail and deploy stay on existing confirm / phrase gates
- Cap `may_invoke` awareness: router uses `max_skills_per_bucket`

## 4. Docs + verify

If bucket/loop tables in `docs/internal/flows/` would drift, update them.

```bash
node .cursor/skills/autodevelop-internal/mcp/flows-check.mjs
```

Remind about `skill-index.ts` only when bucket assignment for semantic search changed.

## Must never

- Author a Brain `SKILL.md` here without `/brain-add-skill` (or an explicit ask)
- Put this meta-skill in `services/brain/`
- Add operator skills to customer `may_invoke` / `loops`
- Break mail/deploy phrase gates by “simplifying” a loop
