# QA Surface 13: Onboarding

> **PRs covered:** 38 (tasks 8-12 — conversational onboarding flow)
> **Dogfoodable:** Partial (requires fresh user account each run)
> **Time estimate:** 20-25 min manual

> **Note:** Auth funnel (PR 38 tasks 1-7) is tested in [Surface 1: Auth & Landing](01-auth-and-landing.md). This surface covers the conversational first-run experience.

---

## Prerequisites

- A fresh user account (no prior chat history, no existing USER.md/SOUL.md)
- Or: ability to reset a test account (clear `setup_progress`, delete USER.md/SOUL.md from storage)
- Supabase dashboard open (to verify `setup_progress`, storage files)

---

## Dogfood Checklist (automated browser pass)

- [ ] New user lands on `/chat` after auth
- [ ] Agent's first message is warm and conversational (not a form or checklist)
- [ ] Chat input is functional during onboarding
- [ ] No console errors during onboarding flow
- [ ] Mobile viewport: onboarding chat works correctly

---

## Manual QA Scenarios

### 13.1 Bootstrap prompt injection (PR 38, task 8)

1. Create a fresh account (or reset test account)
2. Navigate to `/chat`
3. **Expected:** Agent's first message is warm and personal (e.g., "Hey, I just came online — who am I working with?")
4. **Expected:** NOT a form wizard, not a robotic checklist
5. **Expected:** Bootstrap system prompt block is injected (agent knows it's a first-run)

**Notes / failures:**

---

### 13.2 Co-discovery conversation — USER.md (PR 38, task 9)

1. Continue the onboarding chat from 13.1
2. Respond naturally to the agent's questions
3. **Expected:** Agent explicitly asks about:
   - Name / preferred name
   - Agency or brokerage
   - Specializations (HDB, condo, landed, commercial)
   - Years of experience
   - Market areas
   - Communication style preferences
   - Boundaries and preferences
4. **Expected:** Agent writes to USER.md in real time via `write_file`
5. **Verify in Supabase Storage:** `/{clientId}/USER.md` contains the discussed details
6. **Expected:** USER.md has structured fields (not free-form dump)

**Notes / failures:**

---

### 13.3 SOUL.md co-creation (PR 38, task 10)

1. During the same onboarding conversation
2. **Expected:** Agent discusses how it should behave — tone, proactivity, briefing detail, boundaries
3. **Expected:** Agent name "Sunder" is fixed — not up for discussion
4. **Expected:** Agent writes to SOUL.md via `write_file`
5. **Verify in Supabase Storage:** `/{clientId}/SOUL.md` has structured sections (voice, working style, boundaries, communication preferences)
6. **Expected:** SOUL.md starts with sensible defaults, refined by the conversation

**Notes / failures:**

---

### 13.4 Bootstrap completion ritual (PR 38, task 11)

1. After the co-discovery conversation feels complete
2. **Expected:** Agent delivers a warm closing moment (e.g., "I've got everything I need. From here on, I'll just be myself. Let's get to work.")
3. **Verify in Supabase:** `setup_progress` marked complete for this client
4. Start a new chat session (new thread or refresh)
5. **Expected:** Bootstrap injection does NOT re-trigger
6. **Expected:** Normal SOUL.md + USER.md context loaded instead

**Notes / failures:**

---

### 13.5 First useful output during onboarding (PR 38, task 12)

1. During the onboarding chat, mention something actionable (e.g., a client name, a deal you're working on)
2. **Expected:** Agent demonstrates value immediately — creates a CRM contact, drafts a note, or sets a task
3. **Expected:** First conversation is productive, not just setup questions

**Notes / failures:**

---

### 13.6 Fallback heuristic — USER.md modified (PR 38, task 8)

1. Create a scenario where `setup_progress` is NOT marked complete but USER.md has been modified from template
2. Start a new session
3. **Expected:** Agent treats user as onboarded (does not re-trigger bootstrap)
4. **Expected:** Normal session, not onboarding

**Notes / failures:**

---

### 13.7 Second session — personalized context

1. After completing onboarding (13.1-13.4), start a completely new session
2. Chat naturally: "Good morning, what's on my plate today?"
3. **Expected:** Agent uses SOUL.md voice/personality from co-creation
4. **Expected:** Agent knows user context from USER.md (name, specializations, etc.)
5. **Expected:** No trace of bootstrap prompt in agent behavior

**Notes / failures:**

---

## Edge Cases

- [ ] User abandons onboarding mid-conversation — partial USER.md/SOUL.md saved, can resume
- [ ] User gives minimal responses ("I don't want to answer that") — agent handles gracefully, doesn't loop
- [ ] User provides contradictory info — agent uses latest answer
- [ ] Very fast onboarding (user answers everything in 2 messages) — still completes cleanly
- [ ] Very slow onboarding (user takes 20+ turns) — doesn't break or re-trigger bootstrap
- [ ] Refresh page during onboarding — conversation continues from where it left off

---

## Pass / Fail Criteria

- **Pass:** New user gets warm, conversational onboarding. USER.md and SOUL.md populated with real context. Bootstrap completes with closing ritual. Subsequent sessions are personalized. No re-triggering.
- **Fail:** Onboarding feels robotic or form-like. USER.md/SOUL.md empty or template-only after onboarding. Bootstrap re-triggers on second session. Agent doesn't use personalized context.
