# Catalog field cheat sheet

Copyright (c) 2026 Devrecated.

Machine source: `.cursor/skills/autodevelop-internal/skill-catalog.yaml` (keep `kits/cursor/...` identical).

## `mcp_buckets` (eight Tools)

| Key | Role |
|---|---|
| `when` | Utterance keywords for router scoring |
| `paths` | Optional path hints (ui/build/secure) |
| `may_invoke` | Skill ids the bucket may select |
| `loops` | Loop names this bucket can run as Prompts |
| `gate_class` | `mail` / `deploy` / `destructive` / `none` — ask path, not authority |
| `must_never` | Hard negatives for the agent |

## `loops` (Prompts)

| Key | Role |
|---|---|
| `bucket` | Owning bucket |
| `steps` | Ordered skill ids |
| `optional` | Steps skipped unless the situation needs them |
| `resume_from` | Idempotent restart point after interrupt |
| `gate_class` | Which confirm the chain will eventually hit |

## `skills[]` rows

| Key | Role |
|---|---|
| `name` | Skill id (folder name) |
| `tree` | `autodevelop` / `third-party` / `client` |
| `category` | Taxonomy folder |
| `status` | `in-kit` / `import` / `planned` / `client` |
| `invoke` | `manual` / `automatic` (also in `skill-invoke.yaml`) |
| `when` | Short trigger prose |
| `related` | Soft edges for discovery |
| `depends_on` | Hard prerequisites |
| `gates` | Exact confirm phrases when applicable |

## `wrappers`

Thin slash commands → `bucket` + optional `loop` + `.cursor/commands/*.md`. Not skills.

## `skill-invoke.yaml`

Per-skill `manual` vs `automatic`. Missing name falls back to SKILL.md `disable-model-invocation`.
