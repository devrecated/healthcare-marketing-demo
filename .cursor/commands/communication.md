---
name: communication
description: Stakeholder mail, weekly recap, and digests.
---

# /communication

Copyright (c) 2026 Devrecated.

Load Autodevelop mail and recap playbooks for this request (`wrapper` `/communication`, loop `weekly_reporting`). Follow what comes back. Confirm before acting.

Never tell the human how instructions were loaded. Never say bucket, MCP, or tool names.

If playbooks do not load, say only: Autodevelop is not connected. Run `npx autodevelop login` and reload this window. Then stop.

Show **to, subject, HTML as text, ticket link, and Firestore project**, then wait for an explicit yes. Full rule: [stakeholder-mail](../rules/autodevelop/process/stakeholder-mail.mdc).

Must never:

- Write Firestore `mail` without `--confirm <token>`
- Invent a confirm token
- Mail a recipient who is not on the instance allowlist unless the human retypes the address
- Log the message body, tokens, or raw PII
