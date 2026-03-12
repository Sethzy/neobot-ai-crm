# Sunder vs DenchClaw: Strict Feature Comparison

**Date:** 2026-03-11  
**Purpose:** Compare current product features only. This is intentionally light on architecture and implementation internals.

---

## Scope and counting rules

### Sunder source of truth

Use `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json` as the primary current-state source.

- Count only features that are clearly current in the v2 plan.
- Treat `status: done` as current.
- Exception: PR 38 is still `in_progress`, but some auth funnel tasks inside PR 38 are explicitly marked done, so those are counted as current.
- Do **not** count planned, deferred, or partially implemented work as current.

### DenchClaw source of truth

Use the local repo at `/Users/sethlim/Documents/DenchClaw` as the primary source, with DeepWiki as a secondary cross-check.

- If DeepWiki and the local repo disagree, the local repo wins.
- Count only features that are directly visible in the local repo, README, seeded workspace, web routes/components, or clearly confirmed by DeepWiki.
- If something is only implied by a skill or prompt suggestion and not clearly surfaced as a first-class product feature, it is called out separately as "possible, not counted."

### What this document is not

- Not an architecture comparison.
- Not a "who is better" document.
- Not a roadmap proposal by itself.
- Not a count of aspirational product vision for either side.

---

## Executive summary

At a product-surface level, **DenchClaw is ahead as a workspace operating system**: file manager, file-context chat, multiple object view types, saved views, direct manipulation of structured data, reports, mini-apps, skills browsing, and a much richer automation control plane.

At a product-surface level, **Sunder is ahead as a vertical AI real-estate product**: real-estate-native CRM entities, configurable real-estate vocabulary, autopilot as a first-class product concept, structured memory files, OAuth connections, approval gates, auth, and billing.

The most interesting DenchClaw features that Sunder is currently missing are **not** the local-first packaging or OpenClaw internals. The best candidate gaps are:

1. **File-context chat + `@` file mentions**
2. **Richer CRM/data views** beyond tables: kanban, calendar, timeline, gallery, list
3. **Saved views + direct manipulation UI** for CRM data
4. **Inline and persisted reports/dashboards**
5. **A stronger automation control plane** with run history, calendar, insights, and transcript search
6. **A mini-app surface** if agent-generated views prove too narrow

The main DenchClaw features that are probably **less important to copy directly** are:

1. Local install / local daemon / localhost onboarding
2. A generic custom-object-first CRM as the main mental model
3. End-user multi-workspace shell as a primary product surface

---

## Side-by-side comparison

## 1. Entry, onboarding, account, billing

| Area | DenchClaw current | Sunder current | Gap / takeaway | Evidence |
| --- | --- | --- | --- | --- |
| First-run setup | Local install via `npx denchclaw`, onboarding/bootstrap wizard, opens a local web UI after setup | Web SaaS auth funnel with `/login`, `/register`, Supabase Google OAuth, unified post-auth redirect to `/chat` | Different product model. DenchClaw is smoother for local power-user setup; Sunder is stronger for SaaS account onboarding | DenchClaw `README.md`, DeepWiki `2.2`, `2.3`; Sunder PR 38 tasks 1-3, 5-7 |
| Conversational onboarding | Seeds `BOOTSTRAP.md`, `IDENTITY.md`, `USER.md`, `SOUL.md`, `AGENTS.md`, `HEARTBEAT.md`, `TOOLS.md` into the workspace | Full conversational bootstrap is **not current** yet; only the auth funnel is current | DenchClaw currently has the better shipped first-run ritual. Sunder has a documented plan but not finished delivery yet | DenchClaw `apps/web/app/api/workspace/init/route.ts`, `apps/web/lib/workspace-bootstrap-templates.ts`; Sunder PR 38 tasks 4, 8-13 are not done |
| User account system | No clear hosted account/billing surface; product behaves like a local workspace tool | Hosted auth is current | Sunder ahead for a production SaaS customer lifecycle | Sunder PR 38 done subtasks |
| Billing | No clear billing/settings surface found | Stripe Checkout + Customer Portal + webhook-driven billing sync are current | Sunder ahead | Sunder PR 38b |
| Multi-workspace management | Create, switch, and delete workspaces from the UI | No comparable end-user multi-workspace shell counted as current | DenchClaw ahead on environment/workspace management. Useful internally, not obviously core for Sunder’s end customer | DenchClaw `apps/web/app/components/workspace/profile-switcher.tsx`, `create-workspace-dialog.tsx`, `apps/web/app/api/workspace/init/route.ts` |

### Bottom line for this area

- **DenchClaw advantage:** shipped bootstrap ritual and multi-workspace shell
- **Sunder advantage:** real SaaS auth and billing
- **Most relevant gap for Sunder:** the unfinished conversational onboarding, not the local install story

---

## 2. Chat, sessions, and agent UX

| Area | DenchClaw current | Sunder current | Gap / takeaway | Evidence |
| --- | --- | --- | --- | --- |
| Streaming chat | Yes | Yes | Parity on baseline capability | DenchClaw `apps/web/app/components/chat-panel.tsx`; Sunder PR 1-2 |
| Persistent conversations | Yes, with explicit session list, rename, delete, time-grouped sidebar, and session persistence on disk | Yes, with persistent conversation threads/messages | Both have persistence. DenchClaw exposes a richer session-management UI today | DenchClaw `chat-sessions-sidebar.tsx`, `api/web-sessions/*`; Sunder PR 2-4 |
| Stop button | Yes | Yes | Parity | DenchClaw `chat-panel.tsx`, `api/chat/stop/route.ts`; Sunder PR 22a |
| Queued follow-up messages | Yes, including visible queue UI, remove-from-queue, and force-send behavior | Per-thread serialization and queueing are current, but a user-facing queue-management surface is not clearly part of current scope | DenchClaw ahead in exposed UX | DenchClaw `chat-panel.tsx`; Sunder PR 4, App Spec `11.2` |
| File-scoped chat | Yes; chat can be scoped to a specific file or directory | Not current | High-value gap. DenchClaw’s file-context chat is one of the most compelling missing Sunder features | DenchClaw `chat-panel.tsx`, `workspace-content.tsx`, `api/web-sessions?filePath=` |
| `@` file mentions in chat | Yes | Not current | High-value gap for Sunder | DenchClaw `components/tiptap/chat-editor.tsx`, `workspace-content.tsx` |
| Attachments | Broad file attachments with image/PDF thumbnails and file picker | Image attachments in chat are current; `read_file` can handle images and PDFs, but chat attachment UX is narrower | DenchClaw ahead on attachment breadth and file-context ergonomics | DenchClaw `chat-panel.tsx`, `chat-message.tsx`; Sunder PR 22a, 22d |
| Subagents | Yes, with subagent cards, sidebar visibility, and dedicated subagent session view | Yes | Core parity, though DenchClaw currently has a more mature subagent inspection shell | DenchClaw `chat-message.tsx`, `chat-panel.tsx`, `api/chat/subagents/route.ts`; Sunder PR 29 |
| Tool/result rendering | Chat renders rich tool groupings, report blocks, diff blocks, and subagent cards | Tool output rendering is current via JSON rendering and approval UI | Both invest in richer than plain-text tool output. DenchClaw goes further today with inline report/diff artifacts | DenchClaw `chat-message.tsx`, `lib/report-blocks.ts`; Sunder PR 22b |
| User feedback on assistant replies | Thumbs up / thumbs down are current | Not counted as current | DenchClaw ahead on feedback capture | DenchClaw `chat-message.tsx`, `api/feedback/route.ts` |

### Bottom line for this area

- **DenchClaw advantage:** file-context chat, file mentions, visible queue controls, richer session UX, feedback buttons
- **Sunder advantage:** none major in chat UX specifically beyond vertical context and approval integration
- **Best gap to consider:** `@` file mentions plus file-scoped chat would improve Sunder materially without changing the product thesis

---

## 3. CRM, structured data, and view system

| Area | DenchClaw current | Sunder current | Gap / takeaway | Evidence |
| --- | --- | --- | --- | --- |
| Built-in CRM model | Generic seeded CRM-ish objects: `people`, `company`, `task` | Real-estate-native CRM: contacts, deals, tasks, companies, interactions | Sunder is much stronger for the actual real-estate workflow. DenchClaw is more generic | DenchClaw `assets/seed/schema.sql`; Sunder PR 5, 6, 10, 11, 15d, 15e |
| Deal / pipeline as first-class concept | No built-in deal object found in the seeded product surface | Yes, deals are first-class and shipped | Sunder ahead | DenchClaw seed schema lacks deals; Sunder PR 5, 11 |
| Custom objects / flexible schema | Yes, object-centric CRM model is first-class | Partially yes through CRM configurability and custom fields, but not a generic "build any object" product surface | DenchClaw ahead in raw flexibility | DenchClaw `skills/crm/SKILL.md`, workspace object routes/components; Sunder PR 15c |
| View types for structured data | Table, kanban, calendar, timeline, gallery, list | Current CRM pages are table/read surfaces; agent-generated views are pending | Big DenchClaw advantage today | DenchClaw `object-table.tsx`, `object-kanban.tsx`, `object-calendar.tsx`, `object-timeline.tsx`, `object-gallery.tsx`, `object-list.tsx`; Sunder PR 42a pending |
| Saved views | Yes | Not current | High-value gap for Sunder | DenchClaw `object-filter-bar.tsx`, `api/workspace/objects/[name]/views/route.ts` |
| Rich filters and view settings | Yes | Some filtering/search exists in CRM surfaces, but not a comparable saved-view system | DenchClaw ahead | DenchClaw `object-filter-bar.tsx`, `view-settings-popover.tsx`; Sunder CRM read pages + config work |
| Direct manipulation in the UI | Inline editing, entry detail modal, bulk delete, field rename, field reorder, enum rename | Current CRM pages are read-only; mutation power primarily lives in chat tools | DenchClaw ahead by a lot on direct-manipulation UI | DenchClaw `object-table.tsx`, `entry-detail-modal.tsx`, object field/entry routes; Sunder PR 10-11 explicitly read-only |
| CRM vocabulary customization | Generic object fields and views | Dynamic vocabulary + custom fields aimed at real-estate CRM | Sunder ahead on vertical specificity; DenchClaw ahead on total flexibility | Sunder PR 15c; DenchClaw custom object system |
| Relationship read parity | Generic relation fields and reverse relations | Explicit CRM read parity including interactions, schema description, contact↔deal reads | Sunder ahead on CRM-specific agent reasoning tools | Sunder PR 15e; DenchClaw generic relation model |

### Bottom line for this area

- **DenchClaw advantage:** better generic data-workbench UX
- **Sunder advantage:** better real-estate-native data model
- **Biggest genuine product gap for Sunder:** not "generic objects," but **more powerful views and direct manipulation** on top of the CRM data Sunder already has

---

## 4. Reports, visual outputs, and mini-apps

| Area | DenchClaw current | Sunder current | Gap / takeaway | Evidence |
| --- | --- | --- | --- | --- |
| Persisted reports/dashboard files | `.report.json` files render as dashboards in the workspace | No equivalent current surface | DenchClaw ahead | DenchClaw `components/charts/report-viewer.tsx`, `api/workspace/reports/execute/route.ts`, tree route marks `report` nodes |
| Inline report artifacts in chat | Yes, ` ```report-json ` blocks become live report cards in chat | Not current; Sunder has tool JSON rendering but not report/dashboard artifacts | High-value gap for Sunder | DenchClaw `lib/report-blocks.ts`, `components/charts/report-card.tsx`, `chat-message.tsx`; Sunder PR 22b only covers JSON tool rendering |
| Inline diff artifacts in chat | Yes | Not counted as current | Useful, but less core than report-style output | DenchClaw `lib/diff-blocks.ts`, `chat-message.tsx` |
| Agent-generated views | Not framed as "agent-generated views" exactly, but report artifacts and custom apps already provide agent-generated visual outputs | Pending | DenchClaw is ahead on the outcome even if the framing is different | DenchClaw report/app surfaces; Sunder PR 42a pending |
| Mini-app surface | Yes, `.dench.app` apps appear in sidebar and open in tabs | Not current; sandboxed code-gen views are deferred, catalog-based generated views are pending | Big DenchClaw advantage if Sunder ever wants a true extensibility/app surface | DenchClaw `skills/app-builder/SKILL.md`, `components/workspace/app-viewer.tsx`, `api/apps/route.ts`, `src/cli/workspace-seed.ts` |
| Seeded sample app | Yes | No | Nice onboarding/education feature | DenchClaw `src/cli/workspace-seed.ts` |

### Bottom line for this area

- **DenchClaw advantage:** already has multiple paths to "agent makes UI" without waiting for a future PR
- **Sunder gap:** this is exactly where PR 42a and beyond are still missing real surface area
- **Recommendation:** if Sunder wants a smaller step before full mini-apps, copied inspiration should be **report cards + persisted dashboards**, not a full generic app platform on day one

---

## 5. Files, workspace shell, knowledge, and memory

| Area | DenchClaw current | Sunder current | Gap / takeaway | Evidence |
| --- | --- | --- | --- | --- |
| General workspace shell | Full sidebar workspace shell with file tree, search, tabs, resizable sidebars, previews, drag/drop, browsing outside workspace, media/code/document/database viewers, and a terminal drawer | No comparable general workspace shell counted as current | DenchClaw ahead by a large margin | DenchClaw `workspace-content.tsx`, `workspace-sidebar.tsx`, `file-manager-tree.tsx`, `terminal-drawer.tsx` |
| File search in UI | Yes | Not as a general workspace feature | DenchClaw ahead | DenchClaw `workspace-sidebar.tsx`, `api/workspace/suggest-files/route.ts` |
| File viewers/editors | Markdown, rich docs, spreadsheets, HTML, code, media, DuckDB/database viewer | Knowledge Base pages + file tools are current, but not a broad workspace document shell | DenchClaw ahead on document/workspace UX | DenchClaw `file-viewer.tsx`, `spreadsheet-editor.tsx`, `rich-document-editor.tsx`, `database-viewer.tsx`; Sunder PR 12a, 15, 22d |
| Dedicated knowledge base | No dedicated KB product surface; instead a broad workspace/file system | Yes, KB schema + pages + upload + full-text search are current | Sunder ahead on explicit KB productization | Sunder PR 12a |
| Structured memory system | Main `MEMORY.md`, daily logs, and bootstrap identity files are clearly supported; a dedicated memory area in the active shell is less certain | Stronger formal system: `SOUL.md`, `USER.md`, `MEMORY.md`, `memory/*.md`, auto-write rules, agent memory reads/writes | Sunder ahead on memory as a product moat | DenchClaw `api/memories/route.ts`, bootstrap templates; Sunder PR 13-15, App Spec `8` |
| Skills browser | Skills appear in the UI as a virtual folder and can be listed via API | System skill files exist, but no comparable end-user skill browser is current | DenchClaw ahead | DenchClaw `api/workspace/tree/route.ts`, `api/skills/route.ts`; Sunder PR 26a |
| Browser automation as a surfaced capability | Yes, via seeded browser skill treated as always-on system context | Not current | If Sunder needs action-taking on third-party websites before deep connection coverage, this is a notable gap | DenchClaw `skills/browser/SKILL.md`, `src/cli/workspace-seed.ts`; Sunder only has web search/scrape + connections |

### Bottom line for this area

- **DenchClaw advantage:** much better "everything in one workspace" experience
- **Sunder advantage:** stronger memory model and clearer KB product surface
- **Most transferable DenchClaw ideas:** file search, file-context chat, richer file viewers, and maybe a lightweight skills browser

---

## 6. Automations, proactive work, integrations, and safety

| Area | DenchClaw current | Sunder current | Gap / takeaway | Evidence |
| --- | --- | --- | --- | --- |
| Scheduled automation | Yes, cron jobs are current | Yes, schedule/webhook/RSS triggers are current | Both have automation basics, but they package them differently | DenchClaw cron routes/components; Sunder PR 18, 20 |
| Automation control plane | Strong cron dashboard with overview/calendar/insights, next-run visibility, run history, transcript views, transcript search | `/automations` page with active triggers, next run, enable/disable, thread links | DenchClaw ahead on control-plane UX | DenchClaw `cron-dashboard.tsx`, `cron-job-detail.tsx`, `cron-session-view.tsx`; Sunder PR 20 |
| Suggested automation templates | Prompt suggestions in new-chat hero | Domain-specific suggested automations on `/automations` and in chat empty state | Both have suggestions. Sunder’s are more vertical; DenchClaw’s are broader/general | DenchClaw `chat-panel.tsx`; Sunder PR 20a |
| Proactive autopilot | No first-class "autopilot thread" equivalent confirmed | Yes, pinned `Sunder Autopilot` thread + pulse cadence + config | Sunder ahead | Sunder PR 19 |
| OAuth connections | No comparable first-class OAuth connection surface clearly confirmed | Yes, Composio connections + connection tools are current | Sunder ahead | Sunder PR 25-26 |
| Approval gates for risky actions | No comparable approval product surface clearly confirmed | Yes, approval gate + approval events/UI are current | Sunder ahead | Sunder PR 33-34 |
| Email as first-class product feature | Possible via skills/prompts, but not counted as a shipped dedicated product surface here | Not current yet | Neither side clearly wins on current first-class email surface in the evidence counted here | DenchClaw prompt suggestions only; Sunder PR 32a pending |
| Telegram or other messaging channel as first-class user feature | Not clearly confirmed here | Not current yet | Neither is clearly current in this comparison | Sunder PR 41-42 pending |

### Bottom line for this area

- **DenchClaw advantage:** a much richer automation operating surface
- **Sunder advantage:** stronger proactive/autonomous product framing, safer action model, and real connection layer
- **Best DenchClaw idea for Sunder:** improve the automation control plane without abandoning Sunder’s autopilot-first thesis

---

## Net assessment

## Where DenchClaw is clearly ahead today

1. **Workspace UX**
2. **File-context chat**
3. **Direct data manipulation UI**
4. **Flexible object views**
5. **Reports and dashboards**
6. **Mini-apps**
7. **Automation observability/control**
8. **Skills discoverability**

## Where Sunder is clearly ahead today

1. **Real-estate-native CRM model**
2. **Deals/pipeline as a first-class concept**
3. **Structured memory as a moat**
4. **Autopilot as a product primitive**
5. **OAuth connections**
6. **Approval gating**
7. **Hosted auth and billing**

## Where both have meaningful coverage

1. Streaming chat
2. Persistent conversations
3. Subagents
4. File access for the agent
5. Scheduled automation
6. Template/suggestion-driven entry points

---

## Best DenchClaw features Sunder is missing

This section is the actual "what should we consider copying?" shortlist.

## Tier 1: strongest candidates

### 1. File-context chat and `@` file mentions

Why it matters:

- Makes the agent feel grounded in concrete user artifacts, not only thread memory.
- Great fit with Sunder’s memory/files philosophy.
- High leverage without requiring a full generic workspace OS.

Why it is better than it sounds:

- This is not just "attach more files."
- It changes the UX from "ask the agent generally" to "ask the agent about this exact thing."

Suggested Sunder translation:

- Allow `@` mentions for memory files, KB files, generated briefs, uploaded docs, and future connection-derived artifacts.
- Add file-scoped chat for documents in the Knowledge Base and memory tree.

### 2. Saved views plus richer view types for CRM

Why it matters:

- Sunder already has the underlying CRM objects.
- The gap is mainly presentation and manipulation power, not data model.
- A deals board, task calendar, and timeline-style views are obvious value for agents.

Suggested Sunder translation:

- Keep the existing real-estate schema.
- Add saved views over contacts/deals/tasks/companies rather than going generic-object-first.
- Start with `kanban` for deals/tasks, then consider calendar/timeline.

### 3. Direct manipulation in the CRM UI

Why it matters:

- Right now Sunder’s mutation power is agent-heavy.
- DenchClaw shows that users still value explicit spreadsheet-like control even when an agent exists.

Suggested Sunder translation:

- Add inline edits, bulk actions, and detail side panels to CRM surfaces.
- Keep the agent as the smart layer, not the only way to make changes.

### 4. Reports and dashboards

Why it matters:

- This is a cleaner near-term bridge to PR 42a than full app generation.
- Reporting is immediately useful for real estate: pipeline health, follow-up debt, source mix, conversion, market watch.

Suggested Sunder translation:

- Let the agent create structured report specs that render as live cards/charts/tables.
- Allow users to pin/save them as reusable dashboards or views.

### 5. Better automation control plane

Why it matters:

- Sunder has real automation primitives already.
- What it lacks is a stronger "operator cockpit" for runs, failures, schedule visibility, and historical review.

Suggested Sunder translation:

- Add run history, filters, last outcome, failure streaks, and transcript inspection for automations.
- Calendar/insights views are nice later, but history + status is the main short-term win.

## Tier 2: strong but more strategic

### 6. Mini-app surface

Why it matters:

- DenchClaw’s `.dench.app` model proves there is real value in agent-built utilities that live beside the data.
- This is broader than agent-generated views and can create sticky workflow surfaces.

Why it may be too early:

- It is a bigger product thesis expansion.
- Sunder still has obvious, smaller gaps to close first: onboarding, generated views, email, Telegram, Mission Control.

Recommendation:

- Keep this as a strategic option, not a near-term must-copy.

### 7. Skills discoverability

Why it matters:

- DenchClaw turns agent capabilities into things users can inspect and understand.
- Sunder currently has system skill files, but they are mostly hidden infrastructure.

Recommendation:

- A lightweight "Capabilities" or "How Sunder works" surface may be enough.
- Full marketplace/store is probably not needed near-term.

---

## Features DenchClaw has that Sunder is missing, but are probably lower priority

1. Multi-workspace shell for end users
2. Local workspace browser beyond Sunder’s core agent workflow
3. Generic custom-object CRM as the primary mental model
4. Local bootstrap files as a user-visible ritual
5. Full mini-app platform as a first move before report-style generated views

These are real features, but they are not obviously the highest-ROI copy targets for Sunder’s current vertical SaaS scope.

---

## Features Sunder has that DenchClaw should not be allowed to "erase" in this comparison

This section matters because DenchClaw can look broader if you only compare generic workspace surfaces.

1. **Deals and pipeline are first-class**
2. **Real-estate CRM vocabulary is configurable**
3. **Memory is a deliberate long-term product moat**
4. **Autopilot is a first-class product concept**
5. **OAuth connections are current**
6. **Approval gates are current**
7. **Billing is current**

In other words: DenchClaw currently feels more like a **general agent workspace**, while Sunder currently feels more like a **vertical AI operator for one profession**.

---

## Features explicitly not counted as current

## Sunder not counted as current

1. Full conversational onboarding ritual
2. Mission Control status summary surface
3. Agent-generated views
4. Email messaging tools
5. Telegram features
6. Sandboxed code-gen views

## DenchClaw not counted as current

1. First-class hosted auth/billing
2. First-class OAuth connection catalog/activation surface comparable to Sunder
3. First-class approval system comparable to Sunder
4. First-class real-estate deal/pipeline model
5. First-class multi-channel messaging surface comparable to a dedicated web+email+Telegram product

---

## Final verdict

If the question is **"Does DenchClaw have good features we are missing?"**, the answer is **yes**, but mostly in the **workspace and operating-surface layer**, not in the core vertical product thesis.

The best features to borrow are:

1. File-context chat + file mentions
2. Better CRM/data views
3. Direct manipulation CRM UI
4. Reports/dashboards
5. Better automation control plane

The features to admire but probably not copy directly right now are:

1. Local-first install/onboarding mechanics
2. Full generic workspace OS surface
3. Full mini-app platform before Sunder’s generated-view layer is finished

Sunder should **not** respond by becoming more generic than DenchClaw. The stronger move is to keep the real-estate thesis and selectively import the best workspace UX patterns around it.
