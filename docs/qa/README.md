# Sunder QA Plan — Surface-Based Testing

> **Created:** 2026-03-10
> **Total surfaces:** 11
> **Coverage:** 32 done PRs across Phases 1-3

## Execution Order

Test in this order (dependency-safe — each surface builds on the previous):

| # | Surface | File | Dogfood | Manual | Status |
|---|---------|------|---------|--------|--------|
| 1 | Auth & Landing | [01-auth-and-landing.md](01-auth-and-landing.md) | Yes | 15-20 min | [ ] |
| 2 | Chat Core | [02-chat-core.md](02-chat-core.md) | Yes | 20-25 min | [ ] |
| 3 | CRM Tools via Chat | [03-crm-tools-via-chat.md](03-crm-tools-via-chat.md) | Partial | 30-40 min | [ ] |
| 4 | CRM Pages | [04-crm-pages.md](04-crm-pages.md) | Yes | 20-25 min | [ ] |
| 5 | Knowledge Base | [05-knowledge-base.md](05-knowledge-base.md) | Yes | 15 min | [ ] |
| 6 | File & Memory | [06-file-and-memory.md](06-file-and-memory.md) | Partial | 25-30 min | [ ] |
| 7 | Platform Intelligence | [07-platform-intelligence.md](07-platform-intelligence.md) | No | 25-30 min | [ ] |
| 8 | Triggers & Automations | [08-triggers-and-automations.md](08-triggers-and-automations.md) | Yes | 30-40 min | [ ] |
| 9 | Chat Advanced | [09-chat-advanced.md](09-chat-advanced.md) | Yes | 25-30 min | [ ] |
| 10 | Connections | [10-connections.md](10-connections.md) | Partial | 20-25 min | [ ] |
| 11 | Subagents | [11-subagents.md](11-subagents.md) | No | 15-20 min | [ ] |

**Total estimated manual time:** ~4-5 hours

## How to Use

### Pass 1: Dogfood (automated)
For surfaces marked "Yes" in Dogfood column, run the `/dogfood` skill against the running app. Focus on the "Dogfood Checklist" section of each file.

### Pass 2: Manual QA (you)
Walk through each "Manual QA Scenario" as a real user. Check boxes as you go. Write notes for any failures.

### Tips
- **Surfaces 1-2 are gates:** If auth or chat core is broken, nothing else works. Fix those first.
- **Surface 3 seeds data for Surface 4:** Run CRM tool tests via chat first, then check CRM pages.
- **Surface 8 needs patience:** Triggers require waiting or manual DB manipulation to fire.
- **Surface 11 may be incomplete:** PR 29 tasks aren't all marked done. Check implementation status first.

## PR Coverage Map

| Surface | PRs Covered |
|---------|-------------|
| 1. Auth | 38 (partial) |
| 2. Chat Core | 1, 2, 3, 4 |
| 3. CRM Tools | 5, 6, 15c, 15d, 15e |
| 4. CRM Pages | 10, 11, 15c, 15d |
| 5. Knowledge Base | 12a |
| 6. File & Memory | 7, 13, 14 |
| 7. Platform Intelligence | 15 |
| 8. Triggers & Automations | 18, 19, 20, 20a |
| 9. Chat Advanced | 22, 22a, 22b, 22c, 22d, 22e |
| 10. Connections | 25, 26, 26a |
| 11. Subagents | 29 |
| **Audit trail** | 12 (covered implicitly — runs table + step_count checked via Supabase in other surfaces) |

## Legacy

The older `phase-1-manual-qa.md` covers Phase 1 in a different format. This surface-based plan supersedes it for completeness, but the original file is kept for reference.
