# Sunder QA Plan — Surface-Based Testing

> **Created:** 2026-03-10
> **Updated:** 2026-03-20
> **Total surfaces:** 26
> **Coverage:** 50+ done PRs across Phases 1-5

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
| 12 | Approvals | [12-approvals.md](12-approvals.md) | Yes | 20-25 min | [ ] |
| 13 | Onboarding | [13-onboarding.md](13-onboarding.md) | Partial | 20-25 min | [ ] |
| 14 | Billing (Stripe) | [14-billing.md](14-billing.md) | Partial | 20-25 min | [ ] |
| 15 | Message Quota | [15-message-quota.md](15-message-quota.md) | Partial | 20-25 min | [ ] |
| 16 | CRM Working Surfaces | [16-crm-working-surfaces.md](16-crm-working-surfaces.md) | Yes | 30-40 min | [ ] |
| 17 | Calculate Tool | [17-calculate-tool.md](17-calculate-tool.md) | No | 10-15 min | [ ] |
| 18 | Agent-Generated Views | [18-agent-views.md](18-agent-views.md) | Partial | 15-20 min | [ ] |
| 19 | System Prompt & Reminders | [19-system-prompt-and-reminders.md](19-system-prompt-and-reminders.md) | No | 20-25 min | [ ] |
| 20 | Context & Efficiency | [20-context-and-efficiency.md](20-context-and-efficiency.md) | No | 25-30 min | [ ] |
| 21 | Streaming Resilience | [21-streaming-resilience.md](21-streaming-resilience.md) | Partial | 15-20 min | [ ] |
| 22 | Error Recovery | [22-error-recovery.md](22-error-recovery.md) | No | 20-25 min | [ ] |
| 23 | PDF Document Generation | [23-pdf-document-generation.md](23-pdf-document-generation.md) | Partial | 15-20 min | [ ] |
| 24 | Browser Automation | [24-browser-automation.md](24-browser-automation.md) | Partial | 20-30 min | [ ] |

**Total estimated manual time:** ~8-9.5 hours

## How to Use

### Pass 1: Dogfood (automated)
For surfaces marked "Yes" in Dogfood column, run the `/dogfood` skill against the running app. Focus on the "Dogfood Checklist" section of each file.

### Pass 2: Manual QA (you)
Walk through each "Manual QA Scenario" as a real user. Check boxes as you go. Write notes for any failures.

### Tips
- **Surfaces 1-2 are gates:** If auth or chat core is broken, nothing else works. Fix those first.
- **Surface 3 seeds data for Surfaces 4 + 16:** Run CRM tool tests via chat first, then check CRM pages and working surfaces.
- **Surface 8 needs patience:** Triggers require waiting or manual DB manipulation to fire.
- **Surface 12 depends on Surface 3:** You need existing CRM data to test delete gating.
- **Surface 13 requires a fresh account:** Onboarding only fires once — reset `setup_progress` and delete USER.md/SOUL.md to re-test.
- **Surface 14 requires Stripe test mode:** Have `stripe listen` running locally for webhook forwarding.
- **Surface 15 depends on Surface 14:** Quota display references plan state from Stripe billing.
- **Surface 16 extends Surface 4:** Test basic CRM pages first, then view switching and quick edit.
- **Surface 18 needs CRM data:** Agent views are most useful with populated CRM. Run after Surface 3.
- **Surfaces 19-22 are AI engineering tests:** These verify invisible backend behavior. Use Langfuse traces and DB inspection to validate. Surface 19 (system prompt) should pass before testing Surfaces 20-22.

## PR Coverage Map

| Surface | PRs Covered |
|---------|-------------|
| 1. Auth | 38 (tasks 1-7) |
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
| 12. Approvals | 33, 34 |
| 13. Onboarding | 38 (tasks 8-12) |
| 14. Billing | 38b |
| 15. Message Quota | 38c |
| 16. CRM Working Surfaces | 46 |
| 17. Calculate Tool | 8b |
| 18. Agent-Generated Views | 42a |
| 19. System Prompt & Reminders | 15, 15c, 22, 22c |
| 20. Context & Efficiency | 22, 22c, 15 |
| 21. Streaming Resilience | 1, 4, 22, 42a-i |
| 22. Error Recovery | 4, 38c, 33-34, 25-26 |
| 23. PDF Generation | 42a-pdf |
| 24. Browser Automation | 50, 50b |
| **Audit trail** | 12 (covered implicitly — runs table + step_count checked via Supabase in other surfaces) |

## Legacy

The older `phase-1-manual-qa.md` covers Phase 1 in a different format. This surface-based plan supersedes it for completeness, but the original file is kept for reference.
