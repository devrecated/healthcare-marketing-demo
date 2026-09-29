---
name: devops
description: This organization’s environments, promote, and domains.
---

# /devops

Copyright (c) 2026 Devrecated.

Load Autodevelop ship playbooks for this request (`wrapper` `/devops`, loop `ship`). When the work is API, schema, or env wiring, also load API and services playbooks. Follow what comes back.

This command is for **the application in this repository**. It is not Autodevelop’s vendor host.

Read **this organization’s** flow before acting. Do not assume Firebase, two-branch `master` / `release`, or any vendor stack.

```bash
node .cursor/skills/autodevelop-internal/scripts/policies-load.mjs
node .cursor/skills/autodevelop-internal/scripts/branches-load.mjs
node .cursor/skills/autodevelop-internal/scripts/configuration-load.mjs
```

Follow the merged `environments-policy` (env names, promote order, `host`, `hostname`, `whoMayDeploy`), `branch-policy` and `config.json` (`singleBranch`, `branches`, `firebase.*`, `preview.*`), and [configuration](../rules/autodevelop/process/configuration.mdc). Operators edit the same YAML in the operator console Policies panel; pack / login writes the disk copy these loaders read.

Never tell the human how instructions were loaded. Never say bucket, MCP, or tool names.

If playbooks do not load, say only: Autodevelop is not connected. Run `npx autodevelop login` and reload this window. Then stop.

On a single-branch instance, promote and hotfix-to-release refuse.

Four phrases, four separate authorizations when those gates apply. Git is not deploy. `/devops` does not grant any of them.

| Action | Phrase |
|---|---|
| Push the staging branch | `YES PUSH TO MASTER` |
| Deploy staging locally | `DEPLOYED TO STAGING` |
| Promote or hotfix the production branch | `YES PUSH TO RELEASE` |
| Deploy production locally | `DEPLOYED TO PRODUCTION` |

Must never:

- Invent a confirm token or a fifth phrase such as `DEPLOYED TO QA`
- Ignore this org’s `environments-policy` and substitute another product’s stack
- Push a shared branch or deploy without the exact phrase in this chat when that gate applies
- Force-push
- Copy secrets, production data into QA, or QA data into production
- Treat `/commit-push-release` as anything but a hotfix path
