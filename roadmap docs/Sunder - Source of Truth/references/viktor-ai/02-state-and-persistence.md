# Viktor State & Persistence

Source: Direct Q&A with Viktor instance (2026-03-16)

## Skills = Plain Markdown on Disk

No vector DB, no database. Just files:

```
skills/{skill_name}/
├── SKILL.md           # entry point
├── scripts/           # automation scripts
└── references/        # detailed docs
```

- Currently **18 skill directories** in Viktor's workspace
- Each `SKILL.md` has **YAML frontmatter** with `name` and `description`
- Descriptions get **injected into system prompt** so Viktor knows which skills exist without reading them all

## Filesystem is Persistent (Not Ephemeral)

**Key difference from Tasklet.** Viktor's `/work` volume persists everything:
- Skills
- Scripts
- Logs
- Downloaded files
- Repos
- Slack history mirrors

Confirmed: `find /work -name '*.db'` returns nothing. **All state is in files. No SQLite, no database per workspace.**

## Beating the Amnesia Problem — Three Layers

### Layer 1: System Prompt Injection
Every run, the system prompt includes the **list of all available skills** (name + description). This is the "table of contents" — Viktor knows what it knows.

### Layer 2: File Reads at Start
Before any task, Viktor reads the relevant `SKILL.md` files. These contain best practices, workflows, learnings from past runs. This is the actual "memory."

### Layer 3: Slack History on Disk
All Slack messages (channels Viktor is in) are synced to:
```
$SLACK_ROOT/{channel}/YYYY-MM.log
```
Viktor greps these to find past context without the user repeating themselves.

## The Full Rediscovery Chain

```
1. System prompt → "You have skills: [list with descriptions]"
2. Viktor reads SKILL.md for relevant skill(s)
3. Viktor greps Slack history for specific past context
4. Viktor now has enough context to proceed
```

## Comparison: Viktor vs Tasklet vs Sunder Persistence

| What | Viktor | Tasklet | Sunder |
|---|---|---|---|
| **Long-term memory** | Skills (markdown files) | `/agent/home/` files + SQLite | SOUL.md / USER.md / MEMORY.md (Supabase Storage) |
| **Session state** | Persistent volume | Ephemeral sandbox + persistent home | Supabase messages table |
| **Database** | None | SQLite per agent | Supabase Postgres (shared, RLS-isolated) |
| **Conversation history** | Slack logs on disk | SQL + system-reminder blocks | Messages table + context assembly |
| **Rediscovery strategy** | Prompt injection + file reads + grep | DB queries + file reads | Full context assembly (7-layer system prompt) |
| **What persists across runs** | Everything (persistent volume) | `/agent/home/` + DB only | Everything in Supabase |

## Key Insight

Viktor's model is radically simple: **everything is a file.** No database layer, no vector store, no complex persistence. The persistent volume is the entire state store. This works because:

1. Viktor is single-workspace (no multi-tenancy concerns)
2. File I/O is a first-class tool in the Claude Agent SDK
3. Grep is fast enough for the scale of data one workspace generates

This would NOT scale to Sunder's multi-tenant model (hundreds of clients, each with their own state). But for a single-workspace product, it's elegant.
