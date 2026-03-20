# QA Surface 13: Onboarding

> **PRs covered:** 38d (skill-based onboarding)
> **Dogfoodable:** Yes (requires fresh user account or reset USER.md/SOUL.md to templates)
> **Time estimate:** 10-15 min manual

---

## Prerequisites

- A fresh user account (no prior chat history, default USER.md/SOUL.md)
- Or: reset test account (delete and re-upload template USER.md/SOUL.md from storage)

---

## Manual QA Scenarios

### 13.1 Auto-detection of new user

1. Ensure USER.md has only default template content (Name: blank, etc.)
2. Send any message (e.g., "Hey")
3. **Expected:** Agent detects empty USER.md, reads onboarding skill, and starts onboarding naturally
4. **Expected:** Agent asks the user's name and offers to look them up online

**Notes / failures:**

---

### 13.2 Onboarding via explicit trigger

1. With a fresh or existing account, type "onboard" or "personalize"
2. **Expected:** Agent reads the onboarding skill and starts the flow
3. **Expected:** If USER.md/SOUL.md have content, agent asks update vs start fresh

**Notes / failures:**

---

### 13.3 Phase 1 — USER.md co-discovery

1. Continue from 13.1 or 13.2
2. Respond to agent's questions naturally
3. **Expected:** Agent uses ask_user_question with clickable options (not prose questions)
4. **Expected:** If user agrees to online lookup, agent researches via web_search
5. **Expected:** Agent writes USER.md with structured fields (Name, Timezone, Goals, Context, Communication)
6. **Expected:** Agent shows draft and asks if anything needs tweaking
7. **Verify in storage:** USER.md has real content

**Notes / failures:**

---

### 13.4 Phase 2 — SOUL.md co-creation

1. Continue from 13.3
2. **Expected:** Agent transitions to personality questions
3. **Expected:** Asks about tone, opinions, verbosity, boundaries, vibe via ask_user_question
4. **Expected:** Writes SOUL.md — 5-10 lines, punchy prose
5. **Expected:** Shows draft and iterates if user wants changes
6. **Verify in storage:** SOUL.md has real personalized content (not just defaults)

**Notes / failures:**

---

### 13.5 Phase 3 — Confirmation

1. After both files written
2. **Expected:** Agent gives brief summary ("here's what I know / here's how I'll talk")
3. **Expected:** Reminds user files are editable in Memory page

**Notes / failures:**

---

### 13.6 Second session — personalized context

1. After completing onboarding, start a new thread
2. Chat naturally: "Good morning, what's on my plate today?"
3. **Expected:** Agent uses SOUL.md personality from co-creation
4. **Expected:** Agent knows user context from USER.md
5. **Expected:** No onboarding re-trigger (USER.md has content)

**Notes / failures:**

---

## Edge Cases

- [ ] User says "skip" — agent writes sensible defaults, moves on
- [ ] User gives minimal responses — agent handles gracefully, doesn't loop
- [ ] User re-runs onboarding ("personalize me again") — agent reads existing files, asks update vs fresh
- [ ] Very fast onboarding (2-3 messages) — still writes both files
- [ ] SOUL.md exceeds 20 lines — agent should self-correct

---

## Pass / Fail Criteria

- **Pass:** New user gets warm, conversational onboarding via skill. USER.md and SOUL.md populated with real context. ask_user_question used for structured input. Subsequent sessions are personalized. Re-onboarding works.
- **Fail:** Onboarding feels robotic or form-like. Files empty after onboarding. Agent asks prose questions instead of using ask_user_question. SOUL.md is a wall of text.
