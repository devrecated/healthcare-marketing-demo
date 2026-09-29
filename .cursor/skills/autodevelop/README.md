# Autodevelop

Copyright (c) 2026 Devrecated. PolyForm Noncommercial 1.0.0 — see [LICENSE](LICENSE) and the repository-root [LICENSE.md](../../../LICENSE.md).

Cursor plugin for GitHub Projects, tickets, and confirmed stakeholder mail. Notes or a chat request become GitHub Project issues; work is claimed, commented, verified, and reported with allowlisted email after an explicit confirm.

No client or product names belong in this folder. Bind a repo with an **instance** `config.json` (board ids, allowlist, `forbiddenProjects`, preview project, optional `singleBranch` / `branches`) and optional `.policies/` and `.configuration/` outside this tree. Scripts load that instance file first, then a local `config.json`, then [config.example.json](config.example.json). `branches-load.mjs` treats `config.json` as authoritative for branch mode; it must agree with `.policies/branch-policy.yaml` when both exist. Policy defaults ship from [.policies/](.policies/). Hyperparameter defaults ship from [.configuration/](.configuration/).

## Skills

Skill bodies are hosted behind the subscription token under `services/host/skills/autodevelop/`; locally this tree keeps only the scripts, routing, and examples. The eight slash commands in `.cursor/commands/` are the entry point.

| Skill | When |
|---|---|
| [bootstrap](../../../services/host/skills/autodevelop/bootstrap/bootstrap/SKILL.md) | First day: Project, field ids, invites |
| [onboard-client](../../../services/host/skills/autodevelop/bootstrap/onboard-client/SKILL.md) | New client or convert a repo: plugin + `<client-name>` trees |
| [identify-skills](../../../services/host/skills/autodevelop/discovery/identify-skills/SKILL.md) | Classify skills to Read; only client `SKILL.md` stay on disk |
| [ingest-notes-to-project](../../../services/host/skills/autodevelop/ingest/ingest-notes-to-project/SKILL.md) | Notes or a readable URL → numbered preview → issues |
| [create-ticket](../../../services/host/skills/autodevelop/board/create-ticket/SKILL.md) | Chat request / bug / tweak → preview → issue; bind session |
| [pull-project-work](../../../services/host/skills/autodevelop/board/pull-project-work/SKILL.md) | High priority or topic; claim + ingest |
| [ticket-progress](../../../services/host/skills/autodevelop/board/ticket-progress/SKILL.md) | Manual progress comment via `update-progress.mjs` (invoke when you want) |
| [ask-stakeholder](../../../services/host/skills/autodevelop/mail/ask-stakeholder/SKILL.md) | Clarify; optional confirmed mail; Blocked |
| [share-stakeholder-update](../../../services/host/skills/autodevelop/mail/share-stakeholder-update/SKILL.md) | PDF / PPT / video + confirmed ready-to-check mail |
| [verify-ticket](../../../services/host/skills/autodevelop/board/verify-ticket/SKILL.md) | AC + screenshots before In review |
| [deploy-pr-preview](../../../services/host/skills/autodevelop/ship/deploy-pr-preview/SKILL.md) | PR into the configured base + optional preview channel |
| [ask-adam](../../../services/host/skills/autodevelop/ship/ask-adam/SKILL.md) | Release-readiness gate vs `origin/master` / `origin/release` |
| [commit-risk-audit](../../../services/host/skills/autodevelop/cybersecurity/commit-risk-audit/SKILL.md) | Local git-history risk index; confirm before ingest/score |
| [web-search-intense](../../../services/host/skills/autodevelop/search/web-search-intense/SKILL.md) | Exhaustive multi-query search, then a human gate |
| [weekly-delivery-value](../../../services/host/skills/autodevelop/weekly/weekly-delivery-value/SKILL.md) | Jobs panel: worker writes 0–100 snapshots |
| [weekly-status-update](../../../services/host/skills/autodevelop/weekly/weekly-status-update/SKILL.md) | Jobs panel: worker report and email |

Hooks live under `.cursor/hooks/autodevelop/`. They nudge or deny. They never send mail or create issues.

## Scripts

All mutators accept `--dry-run`. Mail requires `--confirm <token>` from `confirm-token.mjs --issue`.

```bash
node scripts/config-load.mjs
node scripts/policies-load.mjs
node scripts/configuration-load.mjs
node --test scripts/*.test.mjs
```

Instance pack for a consumer repo is the operator CLI `pnpm pack:client` at the repository root ([scripts/pack-client/README.md](../../../scripts/pack-client/README.md)). It is not a skill.

Local session files: `.cursor/local/gh-projects/` (gitignored).
