# Notion Agents UX - Test Notes

**Status:** To test
**URL:** https://www.notion.com/product/agents
**Date added:** 2026-02-25

## Why Test This

Notion launched AI agents with a natural-language builder UX. Relevant to Sunder's Mission Control / agent configuration UX decisions.

## Key UX Patterns to Evaluate

### 1. Agent Builder (Natural Language Config)
- Users describe what they want in plain language, Notion builds the agent
- No code required — compare to our Mission Control config approach
- **Test:** How constrained vs. freeform is the builder? Does it feel like magic or like a form with extra steps?

### 2. Agent Types (Pre-built Templates)
- **Q&A Agents** — answer repeated questions from Notion knowledge + connected tools
- **Task Routing Agents** — capture and auto-route incoming work to teams
- **Status Update Agents** — gather updates, generate recurring reports
- Custom agents also supported
- **Test:** How discoverable are templates? How easy to customize from a template?

### 3. Triggers & Scheduling
- Schedule-based or event-driven (new emails, calendar changes, Slack emoji reactions)
- Slack integration: post messages, react to emoji triggers and mentions
- Mail: read, organize, draft, label, sync to databases
- Calendar: view schedules, find times, create/update events
- **Test:** How is the trigger configuration UX? Visual? Form-based?

### 4. Permissions & Scoping
- Granular control: page-by-page, app-by-app what each agent can see and do
- Inherited or custom permission frameworks
- **Test:** How intuitive is the permission scoping? Does it feel secure without being burdensome?

### 5. Audit & Transparency
- All agent runs logged with audit trails (triggers, actions, reasoning)
- Changes reversible through version history
- Admin controls: creation permissions, credit usage monitoring, instant disable
- **Test:** How visible is agent reasoning? Can users understand WHY an agent did something?

### 6. MCP Integrations
- Linear, Figma, HubSpot, Ramp, GitHub, custom MCP servers
- **Test:** How smooth is the integration setup flow?

## Competitive Positioning: Notion vs Sunder

**Notion = horizontal platform, user assembles.** It's a programmable database + agents. With enough config, Notion *can* be a CRM — but the user has to build it. Describe your workflows in natural language, wire up triggers, define schemas, set permissions. Powerful, but it's a toolkit.

**Sunder = vertical product, already assembled.** The CRM schema exists. The agent already knows RE workflows. Triggers are pre-configured. The user doesn't describe what they want — they just use it. Zero config to value.

The real question when testing: **how much setup does Notion actually require to get to "working CRM with agents"?** If it's 30 minutes, that's a threat. If it's 3 hours of fiddling with databases and triggers, that validates our pre-built approach.

## Pattern Comparison

| Notion Pattern | Sunder Equivalent | Notes |
|---|---|---|
| Natural language builder | Pre-configured (no builder needed) | Notion makes you build; Sunder ships it built |
| Pre-built agent templates | Domain-specific agents (already running) | Templates still need customization; ours don't |
| Trigger config UX | Pre-wired triggers | User configures vs. already working |
| Permission scoping | Safety & Approvals (Category 11) | Notion's approach to agent boundaries |
| Audit trails | Evaluation & Ops (Category 12) | Transparency patterns — worth borrowing |
| MCP integrations | Tool integration layer | How Notion handles external tool access |
| Generic database | Purpose-built CRM schema | Notion can be anything; Sunder IS the thing |

## Test Checklist

- [ ] Sign up / access Notion agents
- [ ] Create a Q&A agent from template
- [ ] Create a custom agent from natural language description
- [ ] Configure triggers (schedule + event-based)
- [ ] Test permission scoping UX
- [ ] Review audit trail UX
- [ ] Test Slack integration flow
- [ ] Screenshot key UX patterns for reference
