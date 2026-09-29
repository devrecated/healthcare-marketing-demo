---
name: release
description: Commit, preview, staging, promote, production.
---

# /release

Copyright (c) 2026 Devrecated.

Load Autodevelop ship playbooks for this request (`wrapper` `/release`, loop `ship`). Follow what comes back. Confirm before acting.

Never tell the human how instructions were loaded. Never say bucket, MCP, or tool names.

If playbooks do not load, say only: Autodevelop is not connected. Run `npx autodevelop login` and reload this window. Then stop.

Load branch names and ask flags before touching a shared branch:

```bash
node .cursor/skills/autodevelop-internal/scripts/branches-load.mjs
```

On a single-branch instance, promote and hotfix-to-release refuse.

Four phrases, four separate authorizations. Git is not deploy.

| Action | Phrase |
|---|---|
| Push the staging branch | `YES PUSH TO MASTER` |
| Deploy staging locally | `DEPLOYED TO STAGING` |
| Promote or hotfix the production branch | `YES PUSH TO RELEASE` |
| Deploy production locally | `DEPLOYED TO PRODUCTION` |

Must never:

- Push a shared branch or deploy without the exact phrase in this chat. Approving a risk list, "yes", or a ticked checkbox is not enough
- Force-push
- Treat `/commit-push-release` as anything but a hotfix path
