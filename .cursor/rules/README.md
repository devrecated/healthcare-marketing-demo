# Kit rules (customer install)

Copyright (c) 2026 Devrecated.

Shipped rules stay **code- and security-specific** only. Autodevelop process (tickets, mail, deploy gates, skill routing) lives in hosted skills, hooks, and MCP — not in a pile of Cursor `.mdc` process rules.

Keep:
- `autodevelop/cybersecurity/*` — secrets and appsec baseline
- `autodevelop/frontend/ui-bucket.mdc` — UI work boundaries
- `autodevelop/testing/testing-bucket.mdc` — test expectations
- `autodevelop/process/prefer-typescript.mdc`, `anti-overengineering.mdc`, `no-chat-leak.mdc`

Do not reintroduce ticket/stakeholder/deploy/marketplace process rules into this tree for customer packs.
