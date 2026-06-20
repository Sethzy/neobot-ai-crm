# Sunder Product Blueprint (Detailed, Non-Technical, ASCII)

Date: February 23, 2026  
Audience: Product, design, GTM, operations
Status: PM communication pack (non-technical alignment artifact)

---

## 1) What We Are Building (in plain language)

Sunder is one AI teammate that users can talk to from:

1. Web chat
2. WhatsApp
3. Telegram

It should feel like this:

1. Ask for work in chat.
2. Sunder does safe work right away.
3. Sunder asks for approval before risky work.
4. User handles urgent decisions in one queue.
5. Everything stays organized in one shared product (Tasks, CRM, Knowledge, Memory, Automations, Documents, Channels).

---

## 2) Full Product System Diagram (how everything links together)

```text
                                      +----------------------------------+
                                      |            USER                  |
                                      |  asks, approves, rejects, steers |
                                      +----------------+-----------------+
                                                       |
                      +--------------------------------+--------------------------------+
                      |                                                                 |
                      v                                                                 v
          +------------------------+                                        +------------------------+
          |  Web Chat (Home)       |                                        | Messaging Apps         |
          |  inside Sunder app     |                                        | WhatsApp + Telegram    |
          +-----------+------------+                                        +-----------+------------+
                      |                                                                 |
                      +-------------------------------+---------------------------------+
                                                      v
                                 +-------------------------------------------+
                                 |      SUNDER (single shared brain)         |
                                 |                                           |
                                 | 1) Understand request                     |
                                 | 2) Decide next best action                |
                                 | 3) Check if action is safe or risky       |
                                 | 4) Run work or ask for approval           |
                                 +-------------------+-----------------------+
                                                     |
                          +--------------------------+--------------------------+
                          |                                                     |
                          v                                                     v
           +-------------------------------+                    +--------------------------------+
           | SAFE ACTIONS (auto-run)       |                    | RISKY ACTIONS (approval first) |
           | - update records              |                    | - create queue item             |
           | - prepare summaries           |                    | - wait for user decision        |
           | - normal replies              |                    | - continue only after approval  |
           +---------------+---------------+                    +----------------+---------------+
                           |                                                     |
                           +--------------------------+--------------------------+
                                                      v
                              +-----------------------------------------------+
                              | Mission Control (control center)              |
                              |                                               |
                              | Overview = "what happened today"             |
                              | Queue    = "what needs action now"           |
                              +--------------------+--------------------------+
                                                   |
                                   +---------------+----------------+
                                   |                                |
                                   v                                v
                       +----------------------+          +-----------------------+
                       | Approve              |          | Reject / Snooze       |
                       | continue work        |          | stop or delay work    |
                       +----------+-----------+          +-----------+-----------+
                                  |                                  |
                                  +----------------+-----------------+
                                                   v
                                +-----------------------------------------+
                                | Update product records + send response  |
                                | back to the same place user asked from  |
                                +----------------+------------------------+
                                                 |
      +-------------------+----------------------+-------------------+-------------------+
      |                   |                      |                   |                   |
      v                   v                      v                   v                   v
+------------+      +-------------+        +--------------+    +--------------+    +--------------+
| Tasks      |      | CRM         |        | Knowledge    |    | Documents    |    | Channels     |
| all work    |      | people/deals |        | reusable intel |    | extraction files |    | setup/health |
+------------+      +-------------+        +--------------+    +--------------+    +--------------+
      |
      v
+--------------+
| Memory       |
| user prefs   |
| updates only |
| with approval|
+--------------+
```

---

## 3) Navigation Diagram (what each area is for)

```text
SUNDER APP
|
+-- Chat (Home)
|   Purpose: ask for work, get results quickly
|   Typical action: "Follow up all buyers from this week"
|
+-- Mission Control
|   |
|   +-- Overview
|   |   Purpose: daily snapshot and recent progress
|   |
|   +-- Queue
|       Purpose: approvals, failures, blocked items, urgent actions
|       Typical actions: Approve / Reject / Retry / Open / Snooze
|
+-- Tasks
|   Purpose: single source of truth for work
|   Views: Board / List / Goals
|   Labels: CRM / Manual / Autopilot
|
+-- CRM
|   Purpose: contacts, deals, pipeline health
|   Views: Pipeline / Table / Timeline
|
+-- Knowledge
|   Purpose: saved synthesized findings user can reuse (market, buyer, and conversation insights)
|   Views: Topics / List
|
+-- Memory
|   Purpose: user preferences and working style
|   Rule: suggestions stay pending until user approves
|
+-- Automations
|   Purpose: recurring jobs + Autopilot controls
|   Actions: Run now / Pause / Resume / Change schedule
|
+-- Documents
|   Purpose: Gemini + ExtendAI file extraction pipeline (incoming + processed source files)
|   Views: Incoming / Library
|
+-- Channels
|   Purpose: connect and monitor WhatsApp + Telegram
|   Actions: Connect / Send test / View delivery logs
|
+-- Settings
    Purpose: account and safety defaults (not daily work)
```

---

## 4) End-to-End User Experience Diagram (single request)

```text
Step 1
User asks in Chat / WhatsApp / Telegram:
"Please follow up with all buyers I spoke to this week."

Step 2
Sunder checks what needs to happen:
- gather buyer list
- draft messages
- decide if send is safe now or needs approval

Step 3A (safe path)
If safe:
- Sunder runs the action
- Sunder updates Tasks + CRM
- Sunder replies with clear summary

Step 3B (risky path)
If risky:
- Sunder creates Queue item in Mission Control
- Queue item shows exact action and impact
- User chooses Approve or Reject
- If approved, Sunder continues from same point
- If rejected, Sunder stops and explains

Step 4
Sunder records outcomes:
- what was done
- what failed
- what needs follow-up

Step 5
User sees the result in:
- same conversation channel
- Mission Control Overview/Queue
- related pages (Tasks, CRM, Documents, etc.)
```

---

## 5) Detailed Approval Loop (what really happens when risk appears)

```text
+------------------+      +-------------------------+      +----------------------+
| User request     | ---> | Sunder detects risk     | ---> | Queue item created   |
| includes action  |      | (external send, bulk,   |      | in Mission Control   |
| with consequences|      | irreversible step, etc) |      | with plain summary   |
+------------------+      +------------+------------+      +----------+-----------+
                                       |                              |
                                       |                              v
                                       |                 +---------------------------+
                                       |                 | User decision             |
                                       |                 | [Approve] [Reject] [Snooze]|
                                       |                 +------+----------+---------+
                                       |                        |          |
                                       |                        |          +--> Snooze (delay)
                                       |                        |
                                       v                        v
                          +----------------------+    +-------------------------+
                          | Reject               |    | Approve                 |
                          | stop action          |    | resume from pause point |
                          | keep audit record    |    | run action              |
                          +----------+-----------+    +-----------+-------------+
                                     |                            |
                                     +--------------+-------------+
                                                    v
                                    +------------------------------+
                                    | User gets final plain summary|
                                    | + records are updated        |
                                    +------------------------------+
```

---

## 6) Channel Behavior Diagram (Web, WhatsApp, Telegram all act as one)

```text
                          SAME SUNDER EXPERIENCE

Web Chat ----------------------+
                               |
WhatsApp ----------------------+----> One shared Sunder brain ----> Same Tasks/CRM/etc.
                               |
Telegram ----------------------+

What this means for the user:
1. No workflow rewrite when switching channels.
2. Same quality of answers everywhere.
3. Same approvals and safety rules everywhere.
4. Same history reflected in Mission Control and other pages.
```

---

## 7) Feature Interdependency Diagram (how product areas feed each other)

```text
[Chat + Channels]
   |
   +--> creates/updates --> [Tasks]
   |                          |
   |                          +--> affects --> [Mission Control Queue]
   |
   +--> updates -----------> [CRM]
   |                          |
   |                          +--> creates follow-up tasks --> [Tasks]
   |
   +--> saves findings ----> [Knowledge]
   |
   +--> stores preferences -> [Memory] (approval required for updates)
   |
   +--> runs recurring jobs -> [Automations]
   |                          |
   |                          +--> creates work --> [Tasks + CRM + Queue]
   |
   +--> processes files ----> [Documents]
                              |
                              +--> extracted info -> [CRM + Knowledge + Tasks]
```

Rule: meeting transcripts update Knowledge/CRM/Tasks directly and do not create Documents entries.

---

## 8) Onboarding Diagram (first 10 minutes)

```text
+------------------+
| Sign up          |
+--------+---------+
         |
         v
+------------------+
| Start in chat    |
| guided setup     |
+--------+---------+
         |
         v
+-----------------------------+
| Connect needed services     |
| (only when truly needed)    |
+--------+--------------------+
         |
         v
+-----------------------------+
| Connect channels            |
| WhatsApp and/or Telegram    |
+--------+--------------------+
         |
         v
+-----------------------------+
| First useful result shown   |
| quickly (plan, updates,     |
| draft, or next actions)     |
+-----------------------------+
```

### Channel connection mini-flow

```text
WhatsApp path:
User messages Sunder number -> confirms identity -> gets starter response -> ready

Telegram path:
User opens bot and sends /start -> confirms identity -> gets starter response -> ready
```

---

## 9) Two Real User Scenarios (presentation-ready)

### Scenario A: Buyer follow-up from WhatsApp

```text
1) User (WhatsApp): "Follow up all buyers from this week"
2) Sunder: drafts messages + checks risk
3) Queue: "Approve sending 12 follow-ups?"
4) User taps Approve
5) Sunder sends, logs outcome, updates CRM + Tasks
6) User sees final summary in WhatsApp and Mission Control
```

### Scenario B: New document arrives

```text
1) User uploads valuation report
2) Sunder reads key details
3) Sunder links details to related deal/contact
4) Tasks created for missing items or next steps
5) Knowledge updated with reusable insight
6) User sees status in Documents + Tasks + Mission Control
```

---

## 10) What Ships Now vs Later

### v2 launch (now)

1. Chat-first experience with Mission Control as control center.
2. Mission Control with `Overview` and `Queue`.
3. Unified Tasks surface with source labels (`CRM`, `Manual`, `Autopilot`).
4. Core pages active: CRM, Knowledge, Memory, Automations, Documents.
5. Channels page active for WhatsApp and Telegram.
6. Approval-first handling for risky actions.
7. Memory updates only after user approval.

### Fast follow (next)

1. Better channel health and troubleshooting views.
2. Better analytics and quality signals.
3. Richer channel message formats.
4. Weekly suggestions for repeated work patterns.
5. Managed high-volume lead intake workflow.

### Deferred (later)

1. More channels beyond WhatsApp/Telegram.
2. Advanced campaign control center.
3. Team role complexity and enterprise structures.

---

## 11) 2-Minute Team Talk Track

1. Sunder is one AI teammate available in web chat, WhatsApp, and Telegram.
2. Users start in chat, not dashboards.
3. Safe work runs automatically; risky work always asks for approval.
4. Mission Control Queue is the single place for urgent decisions.
5. All product areas stay connected: Tasks, CRM, Knowledge, Memory, Automations, Documents, and Channels.
6. v2 is channel expansion, not a rebuild.
