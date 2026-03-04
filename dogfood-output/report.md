# Dogfood Report: Sunder

| Field | Value |
|-------|-------|
| **Date** | 2026-03-03 |
| **App URL** | http://localhost:3000 |
| **Session** | sunder-local |
| **Scope** | Full app — PRs 1-12 (Chat, CRM, Knowledge Base) |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 1 |
| Medium | 4 |
| Low | 3 |
| **Total** | **8** |

## Issues

### ISSUE-001: Chat threads all named "New Chat" — no auto-naming

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | ux |
| **URL** | http://localhost:3000/chat |
| **Repro Video** | N/A |

**Description**

All chat threads in the sidebar are labeled "New Chat" regardless of their content. Users cannot distinguish between conversations. Expected: threads should be auto-named based on the first message or conversation topic.

**Repro Steps**

1. Navigate to http://localhost:3000/chat
   ![Step 1](screenshots/chat-page.png)

2. **Observe:** All 3 threads in the sidebar are named "New Chat" with no way to tell them apart.
   ![Result](screenshots/chat-after-send.png)

---

### ISSUE-002: CRM Deals tab missing empty state

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | ux |
| **URL** | http://localhost:3000/crm?tab=deals |
| **Repro Video** | N/A |

**Description**

The Deals tab shows only a search bar and blank space when there are no deals. The Contacts tab correctly shows a "No contacts yet" message with an icon. The Deals tab should have an equivalent empty state for consistency.

**Repro Steps**

1. Navigate to CRM > Deals tab
   ![Result](screenshots/crm-deals.png)

2. **Observe:** No empty state message — just blank white space below the search bar. Compare to Contacts tab which has "No contacts yet" with an icon.
   ![Contacts comparison](screenshots/crm-page.png)

---

### ISSUE-003: Knowledge Base page shows "Coming soon" placeholder

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | functional |
| **URL** | http://localhost:3000/knowledge |
| **Repro Video** | N/A |

**Description**

The Knowledge page shows "Coming soon — This section is under construction." despite the knowledge base (PR 12a) being implemented. The backend schema and API are in place but the UI page was not connected. Users cannot access or manage their knowledge base through the app.

**Repro Steps**

1. Navigate to Knowledge in the sidebar
   ![Result](screenshots/knowledge-page.png)

2. **Observe:** Page shows "Coming soon" placeholder instead of the knowledge base UI.

---

### ISSUE-004: "Documents" sidebar links to /cases showing "Workspace" — naming mismatch

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | ux |
| **URL** | http://localhost:3000/cases |
| **Repro Video** | N/A |

**Description**

The sidebar item labeled "Documents" navigates to `/cases`, which displays a page titled "Workspace" with the description "Fully customised multi-step document processing workflows with built-in classification, extraction, validation, and review." Three different labels for the same page creates confusion. The URL, sidebar label, and page heading should be consistent.

**Repro Steps**

1. Click "Documents" in the sidebar. URL becomes `/cases`, page title reads "Workspace".
   ![Result](screenshots/sidebar-labels.png)

---

### ISSUE-005: Tasks page and Deals tab missing empty state message

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | ux |
| **URL** | http://localhost:3000/tasks, http://localhost:3000/crm?tab=deals |
| **Repro Video** | N/A |

**Description**

Both the Tasks page and CRM Deals tab show a search bar and then blank white space when there are no records. The CRM Contacts tab correctly shows "No contacts yet" with an icon. Tasks and Deals should have equivalent empty state messaging for consistency.

**Repro Steps**

1. Navigate to Tasks page — only a search bar and blank space.
   ![Tasks](screenshots/tasks-detail.png)

2. Navigate to CRM > Deals tab — only a search bar and blank space.
   ![Deals](screenshots/crm-deals.png)

---

### ISSUE-006: Chat threads have no unique URLs — cannot deep-link or share conversations

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | functional |
| **URL** | http://localhost:3000/chat |
| **Repro Video** | videos/issue-007-thread-switch.webm |

**Description**

Switching between chat threads doesn't update the URL — it stays at `/chat` regardless of which conversation is selected. This means conversations can't be bookmarked, shared, or restored on page refresh. Expected: URL should include the thread ID (e.g., `/chat/thread-abc123`).

**Repro Steps**

1. Navigate to Chat page. URL is `/chat`.
   ![Step 1](screenshots/issue-007-step-1.png)

2. Click a different thread in the sidebar. Conversation content changes but URL stays at `/chat`.
   ![Step 2](screenshots/issue-007-step-2.png)

---

### ISSUE-007: Workspace table columns inaccessible on mobile — no horizontal scroll

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | visual |
| **URL** | http://localhost:3000/cases |
| **Repro Video** | N/A |

**Description**

On mobile viewport (375px), the Workspace table hides the CREATED, EVENT DATE, and LAST UPDATED columns entirely. There is no horizontal scroll to access them. The Description column text is severely truncated. Users on mobile have no way to see date information for their cases.

**Repro Steps**

1. View Workspace page on mobile viewport (375x812).
   ![Mobile table](screenshots/mobile-workspace.png)

2. Attempt to scroll right — nothing changes, date columns remain hidden.
   ![After scroll](screenshots/mobile-workspace-scroll.png)

---

### ISSUE-008: 404 page uses default Next.js styling — no branding or navigation

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | visual |
| **URL** | http://localhost:3000/nonexistent |
| **Repro Video** | N/A |

**Description**

Navigating to any invalid route (e.g., `/documents`, `/auth/signin`, `/signin`) shows the default Next.js 404 page — plain text "404 | This page could not be found." with no app branding, sidebar, or navigation back to the app. Users who hit a dead link have no way to return without manually editing the URL.

**Repro Steps**

1. Navigate to any invalid route like `/documents` or `/auth/signin`
   ![Result](screenshots/issue-009-step-1.png)

2. **Observe:** Generic Next.js 404 with no sidebar, branding, or navigation.

---

