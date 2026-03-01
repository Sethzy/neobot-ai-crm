# Mission Control UX Spec (Draft for v2)

Date: February 23, 2026  
Status: Draft for discussion (UI behavior draft, not launch scope authority)

---

## 1. Product Intent (Plain Language)

Sunder should feel simple:

1. User talks to Sunder in chat.
2. Sunder does the work.
3. User checks Mission Control only to review, approve, or steer.

The biggest decision in this draft is now locked:

1. `Chat` is the home screen.
2. Mission Control is a control surface, not the user’s primary workspace.

---

## 2. Guardrails (Locked for v2)

1. Single-user only. No team roles, no multi-seat complexity.
2. AI-first operation. User mostly approves and adjusts.
3. Chat-first operation. No separate dashboard needed for normal daily usage.
4. One unified data model with clear domains: Tasks, CRM, Knowledge, Documents, Memory, Automations, and Channels.
5. Multiple views are allowed, but only over the same underlying records.
6. Borrow proven patterns from OSS tools without importing their bloat.
7. One conversation lane equals one thread, and messages in that same thread are handled in order.
8. Different threads may run at the same time.
9. Memory is shared across the same user’s threads and channels by default.
10. On reconnect, UI must catch up missed updates before showing live status.
11. Memory changes cannot happen silently; user instruction or explicit approval is required.
12. Sessions live in the left sidebar. Do not add a second in-chat thread navigator panel.

---

## 3. Conceptual Model

### 3.1 Primary Navigation (Global)

**AGENT**
1. Chat (Home)
2. Mission Control
3. Tasks
4. Automations
5. Memory

**DATABASE**
6. CRM
7. Knowledge
8. Documents
9. Channels (v1: coming soon, v2: active for WhatsApp and Telegram)

**SYSTEM**
10. Settings (low-priority, admin-only)

### 3.2 Mission Control Tabs (Local)

Mission Control contains two focused tabs:

1. Overview
2. Queue

### 3.3 Global Alerts (Simple)

Top bar has one global alert signal:

1. `Alerts` badge count
2. Critical state highlight
3. Click opens `Mission Control > Queue`

### 3.4 App, Thread, and Memory (Plain Language)

1. `App` = one Sunder assistant setup for one user account.
2. `Thread` = one conversation lane (for example, one chat in sidebar, or one WhatsApp conversation).
3. `Memory` = long-term facts about the user that carry across threads.

Simple behavior rule:

1. Start a new thread: the conversation is fresh, but shared memory still applies.
2. Continue an existing thread: prior thread context is available.
3. Move channels (web chat -> WhatsApp -> Telegram): same user memory still applies.

Session rail behavior (locked):

1. `New chat` creates a new session/thread and opens it immediately.
2. Session list stays in the left sidebar under the Views/navigation section.
3. Main Chat canvas shows one active session at a time.
4. The product must avoid duplicate thread navigation (for example: no extra "Recent Threads" column inside chat canvas).

---

## 4. Information Architecture

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ SUNDER                                              [Search] [Alerts] [Me] │
├───────────────┬────────────────────────────────────────────────────────────┤
│ Left Nav +    │ Main Workspace                                             │
│ Session Rail  │                                                            │
│               │                                                            │
│ AGENT         │ Chat page OR section content                               │
│ • Chat(Home)  │                                                            │
│ • Mission Ctrl│ If Mission Control: [Overview][Queue]                      │
│ • Tasks       │                                                            │
│ • Automations │ If Tasks: [Board][List][Goals]                             │
│ • Memory      │                                                            │
│               │ If CRM/Docs: view toggles                                  │
│ DATABASE      │ (board/list/table/timeline/calendar)                       │
│ • CRM         │                                                            │
│ • Knowledge   │                                                            │
│ • Documents   │                                                            │
│ • Channels    │                                                            │
│ ---           │                                                            │
│ SESSIONS      │                                                            │
│ • session A   │                                                            │
│ • session B   │                                                            │
│ • session C   │                                                            │
│ ---           │                                                            │
│ • Settings    │                                                            │
└───────────────┴────────────────────────────────────────────────────────────┘
```

---

## 5. Surface-by-Surface UX

## 5.1 Chat (Home)

Purpose:

1. Default place where user asks for work.
2. Show lightweight status so user does not need to switch pages.
3. Make thread continuity easy to understand (what is active, queued, or catching up).
4. Keep one clean active-chat canvas; session switching stays in left sidebar.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ CHAT (HOME)                                             AI: Working ●      │
├────────────────────────────────────────────────────────────────────────────┤
│ You: "Follow up all buyers I spoke to this week."                         │
│ AI: "Understood. I will draft messages and ask approval before sending."   │
│                                                                            │
│ Quick chips: [Open Queue] [Open Mission Control] [Open Tasks]              │
│                                                                            │
│ Composer: [ Type a message...                                ] [Send]      │
└────────────────────────────────────────────────────────────────────────────┘
```

Thread continuity signals in Chat:

1. Session list in left sidebar shows one row per conversation lane.
2. Active run state is visible per thread (`Working`, `Queued`, `Needs approval`, `Done`).
3. If the app reconnects, show `Catching up updates...` until missed updates are loaded.
4. If messages are queued in a busy thread, show `2 messages waiting` style status.
5. Starting a new chat creates a new thread; it does not create a new app.
6. Clicking a session in sidebar loads that session in the active chat canvas.

Session rail interaction contract (locked):

1. The `Chat` navigation item in the AGENT section acts as the primary "start new" button.
2. Clicking `Chat` immediately creates and opens a new session, then focuses the chat composer.
3. Only one session can be active in the main chat canvas at a time.
4. Each session row supports: short title, relative timestamp, and optional status chip (`Working`, `Queued`, `Needs approval`, `Done`).
5. Do not render a second thread navigator in the chat canvas (for example: no center `Recent Threads` column).
6. On narrow screens, session navigation may collapse into a drawer, but still represents the same single session list.

## 5.2 Mission Control

Purpose:

1. Central place to monitor work and intervene quickly.
2. No heavy admin builder. Fast status + quick actions only.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ MISSION CONTROL                         [Overview][Queue]                  │
├────────────────────────────────────────────────────────────────────────────┤
│ Tab content area (changes by selected tab)                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

### 5.2.1 Overview Tab

What user sees:

1. Autopilot current state (on/off, next check, last run)
2. Today snapshot (tasks, CRM movement, knowledge updates, approvals)
3. Upcoming scheduled jobs
4. Top urgent items (blocked tasks, goals at risk)
5. Recent activity feed (read-only)

### 5.2.2 Queue Tab

What user sees:

1. Pending approvals
2. Failed actions
3. Blocked tasks
4. Goals at risk
5. One-click actions (`Approve`, `Reject`, `Open`, `Snooze`)
6. This is the single place for urgent action handling.
7. Thread continuity alerts (for example, reconnect catch-up needed, or queued thread backlog).

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ QUEUE                                                                      │
├────────────────────────────────────────────────────────────────────────────┤
│ Approval needed: Buyer outreach draft                      [Approve][Reject]
│ Failed action: Telegram send (rate limit)                     [Retry][Open]
│ Blocked task: Missing price source                            [Open][Snooze]
│ Goal at risk: Close 3 listings this month                     [Open]        │
└────────────────────────────────────────────────────────────────────────────┘
```

## 5.3 Tasks

Purpose:

1. Keep all work in one place.
2. Remove confusion between autonomous work and CRM follow-ups.
3. Preserve one clear execution flow.

Views:

1. Board (default)
2. List
3. Goals (goal progress lens over the same tasks)

Canonical stage-to-column mapping (locked):

1. Agent lifecycle `planning` and `planned` -> `Planned`.
2. Agent lifecycle `in_progress` -> `In Progress`.
3. Agent lifecycle `review` -> `Review`.
4. Agent lifecycle `done` and `cancelled` -> `Done` (`Cancelled` badge shown for cancelled cards).
5. CRM task `open` -> `Planned`; CRM task `removed` is hidden from active board/list views.
6. `Blocked` and `Needs approval` are badges/flags, not columns and not lifecycle stages.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ TASKS                                    [Board][List][Goals]              │
├────────────────────────────────────────────────────────────────────────────┤
│ Planned | In Progress | Review | Done                                      │
│ • [CRM] Follow-up Sarah          • [AUTOPILOT] Buyer outreach draft        │
│ • [MANUAL] Prepare open house    • [CRM] Pipeline review                   │
│                                                                            │
│ Card badges: [BLOCKED] [NEEDS APPROVAL]                                   │
│ Source labels: [CRM] [MANUAL] [AUTOPILOT]                                  │
│ Quick actions: [Open] [Approve] [Unblock] [Move to Review] [Done]          │
└────────────────────────────────────────────────────────────────────────────┘
```

Sort order inside each column:

1. Needs approval
2. Blocked
3. Overdue
4. Due soon
5. Recently updated

CRM follow-up rule:

1. CRM-linked follow-ups are created in Tasks (single source of truth).
2. CRM records link to the task instead of maintaining a separate CRM task list.

## 5.4 CRM

Purpose:

1. Inspect and lightly edit contact and deal state.
2. Keep AI-updated relationship history visible.

Views:

1. Pipeline (kanban)
2. Table
3. Timeline

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ CRM                                       [Pipeline][Table][Timeline]      │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────┬───────────┬───────────┬───────────┐                          │
│ │ Lead (12) │ Viewing(5)│ Offer (3) │ Closed(1) │                          │
│ │ Sarah Lee │ David Tan │ Riveria   │ James Lim │                          │
│ │ ...       │ ...       │ ...       │ ...       │                          │
│ └───────────┴───────────┴───────────┴───────────┘                          │
└────────────────────────────────────────────────────────────────────────────┘
```

## 5.5 Knowledge

Purpose:

1. Keep synthesized reusable intelligence organized by topic.
2. Cover ongoing intelligence like market trends, buyer patterns, and meeting-derived insights.
3. Make source-backed insights easy to reuse.

Views:

1. Topics
2. List

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ KNOWLEDGE                                  [Topics][List]                 │
├────────────────────────────────────────────────────────────────────────────┤
│ Topic: District 10 pricing trend        Updated: Today        [Open]      │
│ Topic: Buyer objection patterns         Updated: Yesterday    [Open]      │
│ Topic: Mortgage rate watch              Updated: Feb 20       [Open]      │
│                                                                            │
│ Quick actions: [Add Knowledge] [Archive] [Link to Goal]                   │
└────────────────────────────────────────────────────────────────────────────┘
```

## 5.6 Memory

Purpose:

1. Show stable user preferences and key context.
2. Let user approve or reject memory updates.
3. Make it obvious that memory is shared across all threads/channels for this user.
4. Keep a clear change log with approval source and rollback actions.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ MEMORY                                                                     │
├────────────────────────────────────────────────────────────────────────────┤
│ Scope: Shared across your chats and channels                               │
│                                                                            │
│ Active memory                                                              │
│ • "Prefers concise WhatsApp messages"                                     │
│ • "Focus area: District 10 and 11"                                        │
│                                                                            │
│ Suggested updates                                                           │
│ • Add: "Prefers calls after lunch"                      [Approve] [Reject] │
│                                                                            │
│ Recent changes                                                              │
│ • Feb 21: Updated communication style (approved by user) [Rollback]       │
└────────────────────────────────────────────────────────────────────────────┘
```

## 5.7 Automations

Purpose:

1. Control recurring schedules and exact-time jobs.
2. Keep Autopilot and scheduled jobs visible in one place.

What user sees:

1. Autopilot status, cadence, and run controls
2. Scheduled automation list with next run and last result
3. Pause/resume, run now, and edit schedule

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ AUTOMATIONS                                                                │
├────────────────────────────────────────────────────────────────────────────┤
│ AUTOPILOT                                                                  │
│ Status: ON   Interval: 30 min   Last: 2:00 PM   Next: 2:30 PM [Run Now]   │
│                                                                            │
│ SCHEDULED AUTOMATIONS                                                      │
│ Morning Briefing         Active   Next: 08:00 tomorrow   Last: Success     │
│ New Lead Triage          Active   Next: in 15 min        Last: Success     │
│ Weekly Pipeline Review   Paused   Next: —                Last: Feb 20      │
│                                                                            │
│ Quick actions: [Pause] [Resume] [Change Time] [Run Now]                   │
└────────────────────────────────────────────────────────────────────────────┘
```

## 5.8 Documents

Purpose:

1. Keep the file-extraction pipeline in one home.
2. Use this page only for Gemini + ExtendAI processing status and linked source files.
3. Remove confusion about where extraction status lives.
4. Meeting transcripts are handled in Knowledge/CRM flows, not in Documents.

Views:

1. Incoming
2. Library

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ DOCUMENTS                                         [Incoming][Library]      │
├────────────────────────────────────────────────────────────────────────────┤
│ • Tenancy_Agreement_Sarah.pdf    Processing...                             │
│ • OTP_Riveria.pdf                Complete -> linked to Deal #R-1208        │
│ • Valuation_D10.pdf              Needs review                               │
└────────────────────────────────────────────────────────────────────────────┘
```

## 5.9 Channels (Versioned State: v1 Placeholder, v2 Active)

Purpose:

1. Keep one stable destination for channel operations across releases.
2. Avoid changing navigation between v1 and v2.

### 5.9.1 v1 state (coming soon placeholder)

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ CHANNELS (COMING SOON)                                                     │
├────────────────────────────────────────────────────────────────────────────┤
│ WhatsApp: Coming soon                                                      │
│ Telegram: Coming soon                                                      │
│                                                                            │
│ Future actions: [Connect] [Send Test] [View Delivery Logs]                │
└────────────────────────────────────────────────────────────────────────────┘
```

### 5.9.2 v2 state (active operations)

What user sees:

1. Connection status for WhatsApp and Telegram
2. Recent thread activity
3. Delivery status and failure diagnostics
4. Quick actions for setup, testing, and logs
5. Continuity status (is conversation history and catch-up healthy)

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ CHANNELS                                                                    │
├────────────────────────────────────────────────────────────────────────────┤
│ WhatsApp: Connected     Last delivery: Success (2 min ago)   [Send Test]   │
│ Telegram: Not connected                                    [Connect]        │
│                                                                            │
│ Recent activity                                                            │
│ • WA outbound to Sarah: Delivered                                         │
│ • TG inbound from David: Waiting approval                                 │
│                                                                            │
│ Continuity status                                                          │
│ • WhatsApp: Healthy                                                        │
│ • Telegram: Catch-up needed (last sync 5 min ago)                         │
│                                                                            │
│ Quick actions: [Connect] [Send Test] [View Delivery Logs]                 │
└────────────────────────────────────────────────────────────────────────────┘
```

## 5.10 Settings (Admin Surface, Not Daily Work)

Purpose:

1. Keep account and policy setup out of primary flows.
2. Prevent settings sprawl in main operating surfaces.

Sections:

1. Profile
2. Notifications
3. Integration credentials
4. Safety defaults

## 5.11 Empty States (First-Time and No-Result UX)

Purpose:

1. Prevent blank pages and dead ends.
2. Make the next step obvious for first-time users.
3. Keep copy short and human, not system-like.

State rules:

1. Every empty state has one primary action.
2. Every empty state has one secondary action or helper link.
3. If a filter causes no results, keep the same page and show a reset action.
4. Copy explains outcome in plain language ("what happens next").

### 5.11.1 Automations Empty States

When no automations exist and Autopilot is off:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ AUTOMATIONS                                                                │
├────────────────────────────────────────────────────────────────────────────┤
│ Nothing is running yet.                                                    │
│ Turn on Autopilot or create your first schedule.                           │
│                                                                            │
│ [Turn On Autopilot]   [Create Schedule]   [See Example Setups]             │
└────────────────────────────────────────────────────────────────────────────┘
```

When Autopilot is on but no scheduled jobs exist:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ AUTOMATIONS                                                                │
├────────────────────────────────────────────────────────────────────────────┤
│ Autopilot is active. No fixed schedules yet.                               │
│ Add schedules only for exact-time routines.                                │
│                                                                            │
│ [Create Schedule]   [Keep Autopilot Only]                                  │
└────────────────────────────────────────────────────────────────────────────┘
```

### 5.11.2 Knowledge Empty States

When no knowledge exists:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ KNOWLEDGE                                                                  │
├────────────────────────────────────────────────────────────────────────────┤
│ Your knowledge base is empty.                                              │
│ Save useful findings here so they stay easy to reuse.                      │
│                                                                            │
│ [Add First Note]   [Run Research]   [View Sample]                          │
└────────────────────────────────────────────────────────────────────────────┘
```

When filters return no results:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ KNOWLEDGE                                                                  │
├────────────────────────────────────────────────────────────────────────────┤
│ No results for this filter.                                                │
│ Try broader tags or clear filters.                                         │
│                                                                            │
│ [Clear Filters]   [Edit Filters]                                           │
└────────────────────────────────────────────────────────────────────────────┘
```

### 5.11.3 Channels Empty States (Versioned)

v1 default state:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ CHANNELS (COMING SOON)                                                     │
├────────────────────────────────────────────────────────────────────────────┤
│ WhatsApp and Telegram are coming soon.                                     │
│ You can keep working normally and enable channels when ready.              │
│                                                                            │
│ [Join Waitlist]   [See Rollout Status]                                     │
└────────────────────────────────────────────────────────────────────────────┘
```

v2 default state (no channels connected yet):

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ CHANNELS                                                                    │
├────────────────────────────────────────────────────────────────────────────┤
│ No channels connected yet.                                                  │
│ Connect WhatsApp or Telegram to start messaging from your existing flows.   │
│                                                                            │
│ [Connect WhatsApp]   [Connect Telegram]   [See Setup Guide]                │
└────────────────────────────────────────────────────────────────────────────┘
```

v1 after waitlist signup:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ CHANNELS (COMING SOON)                                                     │
├────────────────────────────────────────────────────────────────────────────┤
│ You are on the list. We will notify you when channels are available.       │
│                                                                            │
│ [Manage Preferences]   [Back to Chat]                                      │
└────────────────────────────────────────────────────────────────────────────┘
```

### 5.11.4 Chat Reconnect State

When user reopens app after disconnect:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ CHAT (HOME)                                                                │
├────────────────────────────────────────────────────────────────────────────┤
│ Catching up updates from your recent threads...                            │
│                                                                            │
│ [View Queue]   [Keep Waiting]                                              │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Interaction Philosophy

1. User should never wonder where to go first: start in Chat.
2. Anything risky appears in Mission Control Queue with immediate actions.
3. Informational updates stay in Mission Control Overview and object detail pages.
4. Every item has one clear destination page.
5. Any view toggle changes layout, not underlying data.
6. Tasks open in Board view by default.
7. Blocked and needs-approval are card states (badges), not permanent board columns.
8. Top bar `Alerts` is the global shortcut to `Mission Control > Queue`.
9. A new chat means a new thread, not a new app.
10. Memory remains shared across threads/channels unless privacy mode is explicitly introduced later.
11. Same-thread messages are shown and processed in arrival order.
12. Reconnect must always catch up missed updates before showing live status.
13. Session navigation belongs to the left sidebar; avoid extra in-canvas thread columns.

---

## 7. Borrow vs Skip (OSS-Inspired)

## 7.1 Borrow

1. Dense but readable data tables and quick filters.
2. Global `Alerts` badge as a simple urgent signal.
3. Mission-control tab model for operational visibility.
4. Fast task loops (add, complete, snooze, reopen).

## 7.2 Skip

1. Multi-agent org charts for v2.
2. Enterprise team and permissions matrix.
3. Heavy workflow builders.
4. Visual gimmicks that do not improve control speed.

---

## 8. Launch Scope Recommendation (v2)

## 8.1 Ship in v2 launch

1. Unified shell with `Chat (Home)` default.
2. Mission Control with tabs: Overview and Queue.
3. Tasks with Board (default), List, and Goals views.
4. CRM with Pipeline and Table views.
5. Knowledge with topic and list views.
6. Memory with review controls.
7. Automations with Autopilot plus scheduled jobs.
8. Documents with Incoming and Library views.
9. Channels page active for WhatsApp and Telegram with connection status, test send, and delivery diagnostics.
10. Global `Alerts` badge that routes to `Mission Control > Queue`.
11. Thread continuity states in Chat/Channels (`Working`, `Queued`, `Catching up`, `Healthy`).
12. Shared-memory scope message in Memory page plus rollback-visible change history.
13. Left-sidebar Sessions rail with `+ New chat` creating/opening a new session.

## 8.2 Fast follow (v2.x)

1. Tasks calendar view.
2. Goals progress analytics widgets.
3. Knowledge search and saved filters.
4. Documents extraction review polish.
5. Saved filters and saved views.
6. Better keyboard shortcuts.
7. Mobile compact layout improvements.
8. Channels quality upgrades (template workflows, richer diagnostics, and bulk controls).

## 8.3 Defer

1. Team structures and subagent org maps.
2. Advanced campaign control center.
3. Full visual automation builder.

---

## 9. Before vs After

## Before

1. User asks in chat, then checks scattered places for state.
2. Task work is split across multiple surfaces and hard to trust.
3. Channel and automation status are not clearly separated as first-class surfaces.
4. Knowledge and memory are easy to confuse.
5. Approvals and failures are easy to miss.

## After

1. User starts in Chat every time.
2. Mission Control holds one clear operations layer.
3. All work lives in one Tasks surface with clear labels.
4. Automations and Channels have clear dedicated destinations.
5. Urgent items are reachable from any page via top bar `Alerts`.
6. User can open multiple threads without losing continuity.
7. Shared memory stays consistent across web and channel conversations.

---

## 10. PM Acceptance Checklist

1. User can complete normal daily work without leaving Chat.
2. User can find urgent items in under 30 seconds from any page via top bar `Alerts`.
3. Every approval can be completed from `Mission Control > Queue` in 2 clicks or less.
4. Channels page reflects release mode correctly: v1 coming-soon placeholder, v2 active operational surface.
5. Automation status and schedule are visible and editable in Automations.
6. Tasks is a single source of truth for all work, including CRM-linked follow-ups.
7. Task cards show clear source labels (`CRM`, `Manual`, `Autopilot`).
8. Knowledge and Memory are clearly separated in navigation and review flows.
9. Memory suggestions are reviewable with clear approve/reject controls.
10. Tasks defaults to Board view with columns: Planned, In Progress, Review, Done.
11. Blocked and needs-approval are visible as task badges and in `Mission Control > Queue`.
12. Automations, Knowledge, and Channels never render as blank screens.
13. Each empty state has clear primary and secondary actions.
14. Filtered no-result states provide one-click reset.
15. User can tell the difference between app, thread, and memory from UI cues.
16. New chat creates a new thread while still using shared memory.
17. Same-thread queued messages are visible in Chat and Queue.
18. Reconnect experience shows catch-up status and avoids missed updates.
19. Memory page clearly states shared scope and supports rollback from change history.
20. Sessions are listed in left sidebar and selecting one opens it in the main Chat canvas.
21. Clicking the `Chat` global navigation item creates and opens a new session/thread immediately.
22. No duplicate thread navigator appears inside the chat canvas.
23. Session rail behavior is consistent across desktop and mobile; only one active chat canvas is shown at a time.

---

## 11. Final Product Statement

Sunder v2 is chat-first and control-aware:  
Chat is home, Mission Control keeps AI work visible, safe, and easy to steer.
