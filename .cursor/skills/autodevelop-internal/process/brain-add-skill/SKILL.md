---
name: brain-add-skill
description: >-
  Authors a new Autodevelop Brain playbook under services/brain/skills and
  wires skill-catalog.yaml, skill-invoke.yaml, and the matching mcp_bucket.
  Use when the user types /brain-add-skill or asks to add a skill to the Brain.
  Operator-only — not a subscriber bucket playbook.
disable-model-invocation: true
---

# Brain add skill

Copyright (c) 2026 Devrecated.

Operator playbook. Lives under `autodevelop-internal` (see `internal-skills` rule). Do **not** copy this skill into `services/brain/skills/`. Do **not** add it to `mcp_buckets` or `loops`.

## 1. Gather

Ask only what is missing:

| Field | Values |
|---|---|
| Tree | `autodevelop` or `third-party` |
| Category | existing folder under that tree (e.g. `board`, `frontend`) |
| Name | lowercase hyphenated folder / skill id |
| Description | third-person WHAT + WHEN for frontmatter |
| Primary bucket | one of the eight: board, ui, build, message, ship, docs, search, secure |
| Loop | optional — which `loops.*.steps` to join, and whether optional |

## 2. Write the Brain body

Create:

`services/brain/skills/<tree>/<category>/<name>/SKILL.md`

Match nearby playbooks: YAML frontmatter (`name`, `description`), copyright line, numbered steps, gates if mail/deploy. Prefer TypeScript for any new scripts beside the skill.

## 3. Wire the catalog

Edit both copies (keep identical):

- `.cursor/skills/autodevelop-internal/skill-catalog.yaml`
- `kits/cursor/skills/autodevelop-internal/skill-catalog.yaml`

1. Append a `skills:` row: `name`, `tree`, `category`, `status: in-kit`, `invoke`, `when`, `related` (and `depends_on` / `gates` when needed).
2. Add `name` to `mcp_buckets.<bucket>.may_invoke`.
3. Extend `mcp_buckets.<bucket>.when` keywords only if routing would otherwise miss the utterance.
4. If joining a loop: add to `loops.<id>.steps` (and `optional` when not always required). Do not invent a ninth bucket. Do not change `resume_from` casually.

## 4. Invoke mode

Set in both `skill-invoke.yaml` copies:

- `manual` — user names the skill or `/slash`
- `automatic` — agent may start when the task matches

Default new Brain skills to `manual` unless the user says automatic.

## 5. Verify

```bash
node .cursor/skills/autodevelop-internal/mcp/flows-check.mjs
```

If `docs/internal/flows/` tables drifted, update them and run `pnpm docs:check` when that script is part of the change.

Remind the operator to re-run Brain embeddings when semantic select should see the new skill:

`node --experimental-strip-types services/brain/mcp/skill-index.ts`

(Do not run that yourself unless they asked and env is ready.)

## Must never

- Put this meta-skill in `services/brain/`
- Invent a ninth MCP bucket
- Expose third-party skill names as MCP tools
- Skip catalog / invoke wiring after writing a body
- Add `brain-add-skill` or `brain-link-skill` to customer `may_invoke` / `loops`
