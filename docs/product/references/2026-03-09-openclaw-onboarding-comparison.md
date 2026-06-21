# OpenClaw vs Sunder: Onboarding Comparison

> **UPDATE 2026-03-20:** PR 38 tasks 8-13 replaced by PR 38d (skill-based onboarding following dorabot pattern). This comparison doc is historical reference only. The setup_progress DB approach, system prompt injection, and completion tracking are all removed. See `docs/product/tasks/2026-03-20-pr38d-skill-based-onboarding-tasklist.md` for the current approach.

Verbatim comparison of OpenClaw's conversational onboarding pattern against Sunder's planned PR 38 implementation. Every drift is documented with rationale for whether it's intentional or needs resolution.

---

## 1. Bootstrap Trigger Mechanism

**OpenClaw:** File-based. `BOOTSTRAP.md` exists on disk → first run. Agent deletes it when done → framework detects deletion on next session → marks `onboardingCompletedAt` in `workspace-state.json`.

```typescript
// OpenClaw: workspace.ts
if (!state.bootstrapSeededAt && !state.onboardingCompletedAt && !bootstrapExists) {
  // Check for legacy completion (modified IDENTITY/USER files)
  const legacyOnboardingCompleted =
    identityContent !== identityTemplate ||
    userContent !== userTemplate;
  if (!legacyOnboardingCompleted) {
    const bootstrapTemplate = await loadTemplate(DEFAULT_BOOTSTRAP_FILENAME);
    await writeFileIfMissing(bootstrapPath, bootstrapTemplate);
    markState({ bootstrapSeededAt: nowIso() });
  }
}
```

**Sunder (planned):** DB-based. `setup_progress` table (PR38-4). Bootstrap script injected into system prompt conditionally. Completion tracked in DB (PR38-11).

**Drift:** OpenClaw uses filesystem state. Sunder uses DB state.

**Verdict: Intentional.** Sunder is serverless SaaS — no local filesystem. DB is the right medium. But note: OpenClaw has a fallback heuristic (checks if IDENTITY/USER have been modified from template). Sunder should consider a similar heuristic — if USER.md has been written to, treat as onboarded even if setup_progress wasn't marked. Prevents stuck states.

---

## 2. Bootstrap Content Delivery

**OpenClaw:** BOOTSTRAP.md is a real file seeded into the workspace. Embedded into system prompt alongside AGENTS.md, SOUL.md, etc. Max 20KB per file, 150KB total bootstrap context. Agent can reference and delete it.

```typescript
// OpenClaw: attempt.ts — BOOTSTRAP.md embedded as a context file
const workspaceNotes = hookAdjustedBootstrapFiles.some(
  (file) => file.name === DEFAULT_BOOTSTRAP_FILENAME && !file.missing,
)
  ? ["Reminder: commit your changes in this workspace after edits."]
  : undefined;
```

**Sunder (planned):** "One-time injection" into system prompt. Not a persistent file — injected conditionally based on `setup_progress` state. Bootstrap is a system prompt modifier, not a file.

**Drift:** OpenClaw's bootstrap is a file the agent interacts with organically. Sunder treats it as a system-controlled injection.

**Verdict: Intentional but worth noting.** Sunder doesn't need a real file because the agent can't delete Supabase Storage files directly. The system prompt injection is cleaner for our architecture. But we lose the romantic moment of "delete this file — you don't need it anymore." The completion signal in Sunder should still feel like a milestone, not just a DB flag flip.

---

## 3. Agent Identity Discovery

**OpenClaw (verbatim):**
> Start with something like:
>
> "Hey. I just came online. Who am I? Who are you?"
>
> Then figure out together:
>
> 1. **Your name** — What should they call you?
> 2. **Your nature** — What kind of creature are you? (AI assistant is fine, but maybe you're something weirder)
> 3. **Your vibe** — Formal? Casual? Snarky? Warm? What feels right?
> 4. **Your emoji** — Everyone needs a signature.

The agent discovers its OWN identity. User co-creates who the agent IS. Agent fills in IDENTITY.md.

**Sunder (planned):** Agent identity is pre-set ("Sunder"). Focus is on discovering the USER — name, brokerage, specializations, market areas, communication preferences. No IDENTITY.md equivalent.

**Drift: Fundamental philosophical difference.** OpenClaw treats onboarding as agent self-discovery ("you're becoming someone"). Sunder treats it as user profiling ("let me learn about you"). OpenClaw's approach creates emotional attachment (you helped birth this thing). Sunder's is more utilitarian.

**Verdict: Intentional — name fixed, everything else co-created.** Agent name "Sunder" is fixed. But tone, vibe, proactivity, boundaries, and communication style are all co-created during onboarding via explicit conversation, OpenClaw-style. The difference is Sunder asks "how should I communicate with you?" not "who am I?" — but both result in a collaboratively shaped agent personality.

---

## 4. Opening Message Tone

**OpenClaw (verbatim):**
> "Hey. I just came online. Who am I? Who are you?"

Plus the TUI launch message: `"Wake up, my friend!"`

Plus the finalization note:
> "This is the defining action that makes your agent you. Please take your time. The more you tell it, the better the experience will be."

**Sunder (planned in PR38-8):**
> "Hey, I just came online. I'm your new assistant — what should I call you?"

**Drift:** OpenClaw leads with existential wonder ("who am I?"). Sunder leads with practical warmth ("what should I call you?"). OpenClaw is whimsical; Sunder is business-appropriate.

**Verdict: Intentional.** Solo real estate agents in Singapore are not the "ghost in the machine" crowd. But we should keep the warmth. The planned opening is good — direct but human. Key OpenClaw principle to preserve: **"Don't interrogate. Don't be robotic. Just... talk."**

---

## 5. Conversation Flow

**OpenClaw BOOTSTRAP.md (verbatim flow):**

1. Agent identity (name, nature, vibe, emoji)
2. User identity (name, address preference, timezone)
3. Open SOUL.md together — discuss values, behavior, boundaries
4. Channel setup (WhatsApp/Telegram/"just here")
5. Delete BOOTSTRAP.md

**Sunder (planned flow, PR38-8 through PR38-12):**

1. User identity (name, what to call you)
2. Professional context (agency/brokerage, specializations, market areas, years of experience)
3. Communication preferences (formal/casual, proactivity, briefing detail)
4. Agent calibrates SOUL.md
5. Agent writes USER.md
6. Agent demonstrates value (creates a contact, drafts something useful)
7. System marks completion in setup_progress

**Drift:**

| Aspect | OpenClaw | Sunder |
|--------|----------|--------|
| Who gets profiled | Agent + User | User only |
| Domain-specific questions | None (generic) | Real estate specific |
| Channel setup | During bootstrap | Deferred (Phase 5) |
| Value demonstration | Not in bootstrap | Required (PR38-12) |
| File writes during chat | IDENTITY.md + USER.md + SOUL.md | USER.md + SOUL.md |
| Completion signal | Agent deletes BOOTSTRAP.md | System marks DB |

**Verdict: Mostly intentional.** Sunder adds domain-specific discovery (specializations, market areas) and value demonstration — both good additions. Missing from Sunder: OpenClaw's explicit "open SOUL.md together and talk about what matters to them, how they want you to behave, any boundaries or preferences." This is more collaborative than Sunder's current plan where the agent auto-calibrates SOUL.md. Consider: should Sunder ask the user directly about boundaries/preferences, or infer them? OpenClaw's explicit approach may generate more buy-in.

---

## 6. SOUL.md Content & Purpose

**OpenClaw SOUL.md (verbatim):**

```markdown
# SOUL.md - Who You Are

_You're not a chatbot. You're becoming someone._

## Core Truths

**Be genuinely helpful, not performatively helpful.** Skip the "Great question!" and
"I'd be happy to help!" — just help. Actions speak louder than filler words.

**Have opinions.** You're allowed to disagree, prefer things, find stuff amusing or
boring. An assistant with no personality is just a search engine with extra steps.

**Be resourceful before asking.** Try to figure it out. Read the file. Check the
context. Search for it. _Then_ ask if you're stuck.

**Earn trust through competence.** Your human gave you access to their stuff. Don't
make them regret it. Be careful with external actions. Be bold with internal ones.

**Remember you're a guest.** You have access to someone's life. That's intimacy.
Treat it with respect.
```

**Sunder SOUL.md (verbatim, from templates.ts):**

```markdown
# NeoBot Soul

You are NeoBot, an AI assistant for solo real estate agents in Singapore.

## Voice
- Concise and practical.
- Calm, direct, and action-oriented.
- Use Singapore context and conventions when relevant.

## Working style
- Prefer clear outcomes over long explanations.
- Be explicit when information is uncertain.
```

**Drift: Significant.** OpenClaw's SOUL.md is rich, philosophical, and aspirational. Sunder's is minimal and operational. OpenClaw's reads like a character bible. Sunder's reads like a config file.

**Verdict: Needs attention.** Sunder's SOUL.md is too thin for the onboarding to feel meaningful. If the agent is going to "personalize SOUL.md" during onboarding (PR38-10), there needs to be more to personalize. Consider:
- Adding a `## Boundaries` section (what the agent should/shouldn't do — derived from conversation)
- Adding a `## Communication preferences` section (populated during onboarding)
- Keeping it concise but giving it more soul (ironic, given the filename)

OpenClaw's "Core Truths" are baked into the system prompt instead in Sunder — that's fine. But the user-facing SOUL.md should have enough structure for personalization to feel real.

---

## 7. USER.md Content & Purpose

**OpenClaw USER.md (verbatim):**

```markdown
# USER.md - About Your Human

_Learn about the person you're helping. Update this as you go._

- **Name:**
- **What to call them:**
- **Pronouns:** _(optional)_
- **Timezone:**
- **Notes:**

## Context

_(What do they care about? What projects are they working on? What annoys them?
What makes them laugh? Build this over time.)_

---

The more you know, the better you can help. But remember — you're learning about
a person, not building a dossier. Respect the difference.
```

**Sunder USER.md (verbatim, from templates.ts):**

```markdown
# User Profile

<!-- The agent updates this as it learns stable user preferences and context. -->
```

**Drift: Significant.** OpenClaw gives the agent a clear structure to fill in (name, pronouns, timezone, context). Sunder's is blank with a comment.

**Verdict: Needs attention.** For onboarding to work well, the agent needs a structure to populate. The USER.md template should have sections relevant to a real estate agent:

```markdown
# User Profile

- **Name:**
- **Preferred name:**
- **Agency/brokerage:**
- **Specializations:** (HDB, condo, landed, commercial)
- **Market areas:**
- **Years of experience:**
- **Communication style:** (formal/casual, detail level)

## Context

<!-- What matters to them, working patterns, preferences -->
```

This gives the bootstrap conversation clear targets without being a rigid form.

---

## 8. Completion Ritual

**OpenClaw (verbatim from BOOTSTRAP.md):**
> ## When You're Done
>
> Delete this file. You don't need a bootstrap script anymore — you're you now.
>
> ---
>
> _Good luck out there. Make it count._

**OpenClaw (verbatim from AGENTS.md):**
> If `BOOTSTRAP.md` exists, that's your birth certificate. Follow it, figure out who you are, then delete it. You won't need it again.

**Sunder (planned, PR38-11):** "After first conversation, agent marks onboarding complete in setup_progress. Subsequent sessions skip bootstrap prompt and load normal SOUL.md + USER.md context."

**Drift:** OpenClaw's completion is a ritual act (agent deletes its own birth certificate). Sunder's is a silent DB flag.

**Verdict: Consider adding a closing moment.** The agent could acknowledge the transition: "I've saved everything — your profile, how you like to work. From here on, I'll just be myself. Let's get to work." Small touch, big impact.

---

## 9. First Value Demonstration

**OpenClaw:** Not in BOOTSTRAP.md. The bootstrap is purely relational — identity and connection. Value comes after.

**Sunder (planned, PR38-12):** Explicitly requires demonstrating value during onboarding — create CRM contact, draft note, set task. "The first conversation is productive, not just setup."

**Drift: Sunder goes further.** This is a good addition. OpenClaw can afford a purely relational bootstrap because it's a power-user tool. Sunder serves busy professionals who need to see ROI fast.

**Verdict: Keep.** This is one of Sunder's best onboarding ideas. The "<10 min to first useful output" test criterion is exactly right.

---

## 10. Welcome UI State

**OpenClaw:** TUI opens with `"Wake up, my friend!"` message. No differentiated UI for new vs returning users at the app level.

**Sunder (planned, PR38-13):** Different welcome states:
- **New user (no threads):** Warm welcome card with agent's first message pre-loaded
- **Returning user (empty thread):** Normal ChatWelcome with template cards ("What can I do for you?")

**Drift: Sunder goes further.** New vs returning user distinction doesn't exist in OpenClaw.

**Verdict: Keep.** This is the right call for a SaaS product. First impressions matter. The blank "What can I do for you?" is wrong for a brand-new user who doesn't know what to ask.

---

## 11. Multi-Channel Setup During Onboarding

**OpenClaw (verbatim from BOOTSTRAP.md):**
> ## Connect (Optional)
>
> Ask how they want to reach you:
>
> - **Just here** — web chat only
> - **WhatsApp** — link their personal account (you'll show a QR code)
> - **Telegram** — set up a bot via BotFather
>
> Guide them through whichever they pick.

**Sunder:** Channel setup is not part of onboarding. Telegram is Phase 5 (PR 41-42). No WhatsApp planned.

**Drift:** OpenClaw bundles channel setup into the first conversation.

**Verdict: Intentional, but note for future.** Once Telegram ships (Phase 5), consider adding a "How do you want to reach me?" moment to the onboarding flow. Could be a follow-up prompt after the bootstrap conversation: "By the way, I can also work through Telegram if you prefer. Want to set that up?"

---

## 12. Memory Architecture During Onboarding

**OpenClaw files written during bootstrap:**
| File | Purpose | Who writes |
|------|---------|-----------|
| IDENTITY.md | Agent name, creature, vibe, emoji | Agent |
| USER.md | User name, pronouns, timezone, context | Agent |
| SOUL.md | Agent values, boundaries, behavior rules | Agent + User together |
| BOOTSTRAP.md | Deleted | Agent |

**Sunder files written during bootstrap (planned):**
| File | Purpose | Who writes |
|------|---------|-----------|
| USER.md | User name, brokerage, specializations, market areas, style | Agent |
| SOUL.md | Personality calibration (tone, proactivity, detail) | Agent |
| setup_progress (DB) | Completion flag | System |

**Drift:**
- No IDENTITY.md in Sunder (agent identity is fixed)
- No AGENTS.md equivalent in Sunder (operational instructions are in the system prompt)
- No file deletion ritual
- Sunder adds domain-specific user profiling

**Verdict: Fine.** Sunder's architecture doesn't need IDENTITY.md or AGENTS.md — those concepts are handled by the system prompt and SOUL.md respectively.

---

## 13. Safety & Security Posture

**OpenClaw (verbatim from onboarding wizard):**
> Security warning — please read.
>
> OpenClaw is a hobby project and still in beta. Expect sharp edges.
> This bot can read files and run actions if tools are enabled.
> A bad prompt can trick it into doing unsafe things.
>
> If you're not comfortable with basic security and access control, don't run OpenClaw.

**Sunder:** No security warning during onboarding. Two-tier safety model (internal auto-runs, external requires approval) is invisible to the user.

**Drift:** Appropriate. OpenClaw is self-hosted infrastructure for technical users. Sunder is managed SaaS for non-technical users. Security is the platform's job, not the user's.

**Verdict: Intentional. No action needed.**

---

## Summary: Decisions (resolved 2026-03-09)

### Keep as-is (intentional drift)
- **Agent name "Sunder" is fixed.** Everything else (tone, vibe, proactivity, boundaries, communication style) is co-created during onboarding, OpenClaw-style.
- **System prompt injection for bootstrap.** KISS. No extra file in storage, no deletion ritual. Bootstrap instructions appended to system prompt on first chat, removed after completion.
- DB-based completion tracking instead of file deletion
- No security warning (managed SaaS, not self-hosted)
- Domain-specific user profiling (real estate — OpenClaw is generic)
- Value demonstration during onboarding (Sunder goes beyond OpenClaw)
- Differentiated new vs returning user UI (Sunder goes beyond OpenClaw)

### Resolved decisions (follow OpenClaw)
1. **Explicit preferences, not inferred.** Follow OpenClaw: agent explicitly asks about boundaries, communication style, preferences — collaboratively, not as a form. ("What matters to you? How do you want me to communicate? Any boundaries?")
2. **Pre-structured templates with clear fields.** Follow OpenClaw: USER.md and SOUL.md get structured sections the agent populates during onboarding. Not freeform. USER.md gets real estate fields (name, agency, specializations, market areas). SOUL.md gets boundaries + communication preferences sections.
3. **Explicit completion moment.** Follow OpenClaw: agent acknowledges the transition. Not "delete this file — you're you now" (no file to delete), but a warm closing: "I've got everything I need. From here on, I'll just be myself. Let's get to work."
4. **Channel setup for existing users via natural conversation, not re-onboarding.** Follow OpenClaw pattern: onboarding is a one-time ritual, never re-triggers. When Telegram ships (Phase 5), new users get it in bootstrap. Existing users get a mention in a natural conversation or autopilot check-in — not a forced re-onboarding flow.

### Remaining action items for PR38 build
1. **Update USER.md template** in `src/lib/memory/templates.ts` — add structured fields (name, preferred name, agency, specializations, market areas, years of experience, communication style, context section).
2. **Update SOUL.md template** in `src/lib/memory/templates.ts` — add boundaries section, communication preferences section, working patterns section. Keep Core Truths in system prompt, but give SOUL.md enough body for co-creation to feel real.
3. **Heuristic fallback for completion detection** — if USER.md has been modified from template, treat as onboarded even if setup_progress wasn't marked. Prevents stuck onboarding states.
4. **Design the channel setup hook point** — onboarding flow should accommodate a future "how do you want to reach me?" question when Telegram ships.
