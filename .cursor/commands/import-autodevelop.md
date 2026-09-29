---
name: import-autodevelop
description: Install Autodevelop as a user-scope Cursor plugin and remove colliding ~/.cursor/skills copies
---

# Import Autodevelop (user scope)

Copyright (c) 2026 Devrecated.

Install this kit once for every local workspace. Do not copy `.cursor/skills|hooks|rules/autodevelop` into each product repo.

Instance bindings (`config.json`, `people.json`) stay in the consumer repo. See `docs/configure.md`.

## 1. Preview

From the Autodevelop repo root:

```bash
pnpm autodevelop:import
```

That is a dry-run. It lists the plugin directory and every colliding skill folder under `~/.cursor/skills/<category>/<name>/` that Autodevelop already ships. It does not delete unique personal skills (GSAP, Capacitor, MUI, PWA, SEO, …). It never touches `~/.cursor/skills-cursor/`.

## 2. Apply (only after they confirm)

If the list looks right:

```bash
pnpm autodevelop:import --apply
```

The script:

1. Copies the shippable plugin payload into `~/.cursor/plugins/local/autodevelop` (Cursor rejects a symlink whose target is outside that folder)
2. Seeds `~/.cursor/commands/import-autodevelop.md`
3. Deletes only the colliding skill folders
4. Rewrites `~/.cursor/skills/CATEGORIES.md`

## 3. Reload

Tell them to run **Developer: Reload Window**. Slash names (`/ask-adam`, `/create-ticket`, …) now come from the plugin.

## Cloud Agents

User plugins do not load on Cloud Agents. Those workspaces still need the project `hooks.json` copy from `docs/install.md`.
