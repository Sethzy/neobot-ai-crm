# Tasklet LinkedIn Automation - Source Analysis (Verbatim Capture)

Captured from user-provided reverse-engineering notes. Preserved with original wording/typos where possible.

---

Task let linkedin automatio n

Let me trace through the execution architecture systematically.

System Architecture Overview
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Schedule       │────▶│  Agent (Me)     │────▶│  Computer Use   │
│  Trigger        │     │  Orchestrator   │     │  Connection     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  Virtual Machine│
                                                    │  LinkedIn.com   │
                                                └─────────────────┘

Execution Trace: Line-by-Line
Phase 1: Trigger Fires
STATE: t=0, 9:00 AM daily schedule fires

1. Scheduler daemon detects cron match
2. System creates invocation payload:
   {
     trigger_type: "schedule",
     trigger_id: "trig_abc123",
     timestamp: "2026-02-17T09:00:00Z",
     context: { task: "linkedin_daily_engagement" }
   }
3. Agent (me) is invoked with this payload as a system message
State after Phase 1: Agent is now running, has trigger context, no browser yet.

Phase 2: Computer Use Connection Activation
STATE: Agent executing, needs browser access

4. Agent calls tool: computer_use connection tools
   - If connection exists → activate tools
   - If not → create_new_connections(type: "computer_use")

5. Connection provisioning:
   a. Backend spins up isolated VM/container
   b. VM contains:
      - Headless Chrome/Chromium (or visible via VNC)
      - service (mouse/keyboard)
   c. Connection established via WebSocket or similar protocol

6. Tools now available to agent:
   - screenshot() → returns current screen as image
   - click(x, y) → injects mouse click at coordinates
   - type(text) → injects keyboard input
   - scroll(direction, amount) → injects scroll events
   - navigate(url) → browser navigation
State after Phase 2: VM running, browser open (blank page), agent has control tools.

Phase 3: Authentication Flow
STATE: Browser at blank page, need to reach LinkedIn authenticated

7. Agent executes: navigate("https://linkedin.com")

8. Agent executes: screenshot()
   Returns: Image of LinkedIn homepage/login page

9. Agent analyzes screenshot (vision):
   - Detects login form
   - Locates email field coordinates: (x: 450, y: 320)
   - Locates password field coordinates: (x: 450, y: 380)

10. TWO POSSIBLE PATHS:

    PATH A - Session persistence (cookies exist):
    └── Screenshot shows logged-in feed → skip to Phase 4

    PATH B - Need login:
    └── Agent prompts user for credentials OR
    └── User manually logs in while agent watches

Critical insight: The agent sees the screen as an image and uses vision/OCR to understand UI state. There's no DOM access — just pixels.
State after Phase 3: Browser showing LinkedIn feed, authenticated session.

Phase 4: Action Loop (The Actual Automation)
STATE: Logged into LinkedIn, ready to perform tasks

11. REPOST WORKFLOW:

    a. screenshot() → see current feed

    b. Vision analysis:
       - Parse visible posts
       - Identify post content/author
       - Locate "Repost" button coordinates for target post
       - Example output: "Post about AI in healthcare at (x: 890, y: 456)"

    c. click(890, 456) → click repost button

    d. wait(random(2000, 5000)ms) → human-like delay

    e. screenshot() → verify repost modal appeared

    f. Locate "Repost" confirmation button → click()

    g. wait(random(30000, 90000)ms) → longer delay

12. CONNECTION REQUEST WORKFLOW:

    a. navigate("https://linkedin.com/search/results/people/?keywords=...")

    b. screenshot() → see search results

    c. Vision analysis:
       - Identify profile cards
       - Locate "Connect" buttons
       - Extract: [{name: "Jane Doe", title: "PM at Google", connect_btn: (x, y)}]

    d. click(connect_btn.x, connect_btn.y)

    e. screenshot() → check for "Add a note?" modal

    f. IF modal exists:
       - locate text field
       - click(field.x, field.y)
       - type("Hi Jane, I'd love to connect...")
       - locate send button → click()

    g. wait(random(60000, 180000)ms) → 1-3 min delay

    h. REPEAT for N profiles (typically 5-15 per session)

13. Loop continues with rate limiting:

    actions_taken = 0
    MAX_ACTIONS = 15

    while actions_taken < MAX_ACTIONS:
        perform_action()
        actions_taken++
        delay(random_human_interval())

        if actions_taken % 5 == 0:
            long_pause(random(120000, 300000)ms)  // 2-5 min break

State during Phase 4: Iterating through actions, tracking count, injecting delays.

Phase 5: Session Termination
STATE: Actions complete or limit reached

14. Agent optionally: navigate("about:blank") or close browser
15. Connection may persist (for faster next run) or terminate
16. Agent run completes, returns summary to system

Why Detection Still Happens (Root Cause Analysis)
LinkedIn's detection operates at multiple layers:

Layer | What They Detect | Why "Computer Use" Still Triggers
---|---|---
Network | Request timing, TLS fingerprints, IP reputation | VM IPs often flagged; timing patterns detectable
Browser | Canvas fingerprint, WebGL, navigator properties | Headless browsers have detectable signatures
Behavioral | Mouse movement curves, click precision, scroll patterns | Agent clicks are precise (pixel-perfect); humans are messy
Session | Action velocity, time-on-page, navigation patterns | Even with delays, patterns emerge over days/weeks
ML Models | Aggregate behavior anomaly detection | Models trained on millions of real users

The Fundamental Problem

Human mouse movement:    Agent mouse movement:

    ~~~~/\~~~~             ·
   /          \            │
  ·            ·           ·

(curved, noisy,         (instant teleport
 acceleration)           to coordinates)

Even with random delays, the micro-behaviors differ. LinkedIn's models catch this over time.

Summary
The system works by:
1. Provisioning a real browser (not HTTP scraping)
2. Using vision to understand UI (screenshot → analysis → coordinates)
3. Injecting human input events (click, type, scroll)
4. Rate limiting to stay under velocity thresholds

The root vulnerability is that pixel-perfect input + deterministic decision-making creates statistical signatures that ML models can detect, even when individual actions look normal.
