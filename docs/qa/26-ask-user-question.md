# QA Surface 26: Ask User Question Widget

> **PRs covered:** 51b (claude.ai parity — schema + UI + system prompt)
> **Dogfoodable:** Partial (requires prompts that trigger the widget; UI interactions are manual)
> **Time estimate:** 15-20 min manual
> **v2 tools:** `ask_user_question`

---

## Prerequisites

- Logged-in user with an active thread
- Agent must be able to respond (not quota-blocked)

---

## Dogfood Checklist (automated browser pass)

- [ ] Chat page loads without errors
- [ ] Sending a message that triggers `ask_user_question` renders the widget inline

---

## Manual QA Scenarios

### PR 51b: Ask User Question — Claude.ai Parity

### 26.1 single_select — radio buttons + Continue

1. Send: "I want to draft a follow-up email but I'm not sure about the tone"
2. Agent should show a question widget with radio buttons (○/●)
3. Click one radio — it highlights but does NOT submit
4. "Something else..." text input is visible below options
5. "Skip" button is visible bottom-left
6. Click "Continue →" — widget closes, user message shows `Q: ...\nA: ...`
7. **Expected:** Agent continues using the selected answer

**Notes / failures:**

---

### 26.2 multi_select — checkboxes + counter (no Skip)

1. Send: "Help me prepare for a client meeting — what should I cover?"
2. Agent should show a question widget with checkboxes
3. Select 2+ options — counter shows "N selected · Cmd+Enter to submit"
4. There should be NO Skip button (counter replaces it)
5. "Something else..." text input is visible
6. Click "Continue →" — answer is comma-separated in Q&A format
7. **Expected:** Agent uses all selected items

**Notes / failures:**

---

### 26.3 rank_priorities — drag-to-reorder (no "Something else...")

1. Send: "Which of these should I prioritize this week?" (after agent has context of multiple tasks)
2. Agent should show a question widget with drag handles (⠿) and numbered items
3. There should be NO "Something else..." input
4. Skip button IS visible
5. Drag items to reorder — numbers update live
6. Click "Continue →" — answer format: `1. X, 2. Y, 3. Z` (no "Ranked:" prefix)
7. **Expected:** Agent respects the priority ordering

**Notes / failures:**

---

### 26.4 Multi-question pagination

1. Send: "I want to write an article — ask me some clarifying questions before you start"
2. Agent should batch 2-3 questions in one widget call
3. Verify: "Question 1 of N" text + dot indicators (●○○) + ‹ › arrows
4. Answer Q1 via Continue → auto-advances to Q2
5. Use ‹ prev arrow to go back — previous question visible
6. **Expected:** Final user message shows all answered Q&A pairs stacked

**Notes / failures:**

---

### 26.5 Skip omits question from message

1. Trigger a multi-question widget (same as 26.4)
2. Skip Q1 via Skip button
3. Answer Q2 via Continue
4. **Expected:** User message only contains Q2's Q&A pair — Q1 is completely absent

**Notes / failures:**

---

### 26.6 Dismiss X — silent close

1. Trigger a multi-question widget
2. Click the ✕ dismiss button (top-right in pagination header)
3. **Expected:** Widget disappears. NO user message is sent. Agent does not continue.

**Notes / failures:**

---

### 26.7 Escape key behavior

1. Trigger a single_select question
2. Press Escape key
3. **Expected:** Question is skipped (same as clicking Skip)
4. Trigger a multi_select question
5. Press Escape key
6. **Expected:** Nothing happens — Escape does not skip multi_select

**Notes / failures:**

---

### 26.8 Cmd+Enter shortcut for multi_select

1. Trigger a multi_select question
2. Select 2 options via checkboxes
3. Press Cmd+Enter (or Ctrl+Enter)
4. **Expected:** Submits the selection (same as clicking Continue →)

**Notes / failures:**

---

### 26.9 "Something else..." free text override

1. Trigger a single_select question
2. Select a radio option
3. Type custom text in "Something else..." input
4. Click Continue →
5. **Expected:** Custom text is submitted, NOT the radio selection (free text overrides)

**Notes / failures:**

---

### 26.10 Agent writes message before widget

1. Trigger any ask_user_question scenario
2. **Expected:** Agent always writes a brief conversational message BEFORE the widget appears — never shows options silently without preceding text
3. **Verify in Langfuse:** The assistant message has text content before the tool call

**Notes / failures:**

---

## Edge Cases

- [ ] Widget renders correctly on mobile viewport (responsive)
- [ ] Disabled state: older messages show all questions stacked with no interactive controls
- [ ] Continue → button is disabled until a selection is made (single/multi)
- [ ] rank_priorities Continue → is always enabled (default ordering is valid)
- [ ] Very long option labels wrap correctly without breaking layout

---

## Pass / Fail Criteria

- **Pass:** All 3 question types render with correct per-type controls (radio/checkbox/drag). Skip, Something else, and counter visibility matches the per-type matrix. Pagination works for 2-3 questions. Dismiss is silent. Skipped questions omitted from message. Keyboard shortcuts work (Esc for single/rank, Cmd+Enter for multi).
- **Fail:** Wrong control type rendered. Skip shown on multi_select. Something else shown on rank_priorities. Dismiss sends a message. Skipped questions appear in message. Hook-order crash when scrolling past old messages.
