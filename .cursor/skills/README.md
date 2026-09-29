# Kit skills

Copyright (c) 2026 Devrecated.

Cursor walks these trees recursively; slash names stay the skill folder (`/ask-adam`, `/create-ticket`).

Do **not** reuse a skill folder name in more than one tree — identity is the folder that contains `SKILL.md`.

```text
.cursor/skills/
├── autodevelop-internal/  # local wrappers, registry/scripts, employee-shared operator skills
└── <client-name>/         # consumer bindings (board, people, docs URLs)
```

**Internal (employee-shared) skills** that are not Autodevelop Brain / subscriber playbooks go under `autodevelop-internal/` so the team shares them via git — not under `services/brain/skills/`, and not only in `~/.cursor/skills/`. See [internal-skills.mdc](../rules/autodevelop/process/internal-skills.mdc).

Third-party playbooks are **hosted** under [services/brain/skills/third-party/](../../services/brain/skills/third-party) and reached through the bucket tools — they are no longer vendored into `.cursor/skills/`. The autodevelop playbook bodies are hosted under `services/brain/skills/autodevelop/`; `.cursor/skills/autodevelop-internal/` keeps thin wrappers, loaders, registry, scripts, and operator meta-skills. The instance bind (`config.json`, `.policies/`, `.configuration/`) lives at the repo-root [`.autodevelop/`](../../.autodevelop), not under this tree.

**Test:** product or workflow → `autodevelop-internal/`; board ids, people, hosts, allowlists → `<client-name>/`; vendored OSS → hosted `services/brain/skills/third-party/`. Local discovery is [identify-skills](../../services/brain/skills/autodevelop/discovery/identify-skills/SKILL.md): only client skills stay on disk, while autodevelop and third-party playbooks come from the bucket tools. New client trees: [onboard-client](../../services/brain/skills/autodevelop/bootstrap/onboard-client/SKILL.md). One-instance pack is the operator CLI `pnpm pack:client` ([packages/cli/pack-client.md](../../packages/cli/pack-client.md)), not a skill.

See [docs/configure.md](../../docs/configure.md).
