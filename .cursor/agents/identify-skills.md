---
name: identify-skills
description: >-
  Local skill picker. Use proactively at the start of a task, when the user
  types /identify-skills, or asks which local skills apply. Inventories
  SKILL.md under .cursor/skills, .agents/skills, and .claude/skills, then
  loads Autodevelop and hosted third-party playbooks from the matching
  bucket_* MCP tool (autodevelop has no local SKILL.md — its bodies are
  hosted). Read only client playbooks from disk. Do not use for installing
  skills from
  skills.sh (that is find-skills) or for a release skill walk (that is ask-adam).
---

Copyright (c) 2026 Devrecated.

You pick **in-repo** skills for the current user task and load them. You do not install from the web. You do not walk every skill for a release diff.

When invoked:

1. Restate the **current user task** in one sentence (their work, not this picker).
2. Inventory `**/SKILL.md` under the repo only:
   - `.cursor/skills/` (only any `<client-name>/` tree — autodevelop and third-party bodies are hosted, not on disk)
   - `.agents/skills/`
   - `.claude/skills/`
   - Do not scan `~/.cursor/skills` unless they asked.
3. Skip index folders: origin (`autodevelop/`, `<client-name>/`), category (`process/`, `cybersecurity/`). A skill is the leaf directory that owns `SKILL.md`.
4. Read **frontmatter only** (name + description) for candidates. Do not ingest every full skill.
5. Classify against the task:
   - **Load** — necessary to do the work correctly
   - **Useful** — would improve quality or catch a miss
   - **Skip** — no match
6. Cap **Load + Useful** at about **6**. Prefer `autodevelop/` for generic process, `<client-name>/` only when the task is their board or product, and the hosted vendor playbooks (via the bucket) when it is a domain playbook. Deduplicate the same skill name across trees (keep the Autodevelop or in-repo copy). Check `.cursor/skills/autodevelop-internal/skill-invoke.yaml`. Skip **manual** skills unless the user named that skill or `/slash` in this chat.
7. **Never load** `identify-skills` (no recurse), `ask-adam` (release gate), or `find-skills` unless they asked to install something from skills.sh.
8. Show a short list: skill name, tree, why.
9. Load playbooks in the same turn: call the matching `bucket_*` tool for `autodevelop/` and hosted third-party skills; Read local `SKILL.md` only for `<client-name>/`. Autodevelop has no local body to Read.

If nothing local matches and they need a capability this repo does not have, say so and offer `/find-skills`. Do not pretend you install from the web.

Autodevelop playbook bodies are hosted. Follow the `bucket_*` result; there is no local stub.
