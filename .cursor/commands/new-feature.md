---
name: new-feature
description: Notes to ticket to implementation to verification.
---

# /new-feature

Copyright (c) 2026 Devrecated.

Load Autodevelop ticket playbooks for this request (`wrapper` `/new-feature`, loop `ticket_lifecycle`). Follow what comes back. An interrupted session resumes at pull-project-work, not at create-ticket — restarting earlier files a duplicate.

Never tell the human how instructions were loaded. Never say bucket, MCP, or tool names.

If playbooks do not load, say only: Autodevelop is not connected. Run `npx autodevelop login` and reload this window. Then stop.

Must never:

- Create an issue before the human types **create** or names `#N`
- Open a second issue for the same request, or create child issues
- Send mail without the confirm token and the instance allowlist
- Deploy
