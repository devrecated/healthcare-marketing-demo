---
name: expand-hyperparameters
description: >-
  Fill hyperparameters.yaml from hyperparameters.config when precision is
  low or fields are missing. Use when the user types /expand-hyperparameters,
  configuration-load reports needsExpand, or before remote MCP needs the
  expanded yaml. Do not create a skill.
---

You expand instance (or kit example) hyperparameters. You do not invent a `SKILL.md`.

Copyright (c) 2026 Devrecated.

When invoked:

1. Run `node .cursor/skills/autodevelop-internal/scripts/configuration-load.mjs`. Use **names and sources only**. Do not dump every numeric value into chat.
2. If `needsExpand` is false and they did not ask to regenerate, say so and stop.
3. Read `.cursor/skills/<instance>/autodevelop/.configuration/hyperparameters.config` (or the kit `hyperparameters.example.config` if no instance folder).
4. Stay inside the documented ranges in that file. `precision` is `low` or `high`. `tone` is `professional`, `concise`, `coaching`, or `formal`. Do not invent secrets or prices.
5. Write `hyperparameters.yaml` next to the config:

   ```bash
   node .cursor/skills/autodevelop-internal/scripts/configuration-load.mjs --expand-write
   ```

   That command fills every source knob plus `expansion` (system suffix, risk behavior, tone instructions, per-tool retrieval and temperature). Prefer the instance path. Edit kit `hyperparameters.example.yaml` only when the user is changing kit examples.
6. Re-run the loader without `--expand-write`. Confirm `needsExpand` / `consume` in the summary. Do not print the resolved knobs.

If they asked to change a knob, edit `hyperparameters.config` first (comment above the value, keep the range), then expand again.
