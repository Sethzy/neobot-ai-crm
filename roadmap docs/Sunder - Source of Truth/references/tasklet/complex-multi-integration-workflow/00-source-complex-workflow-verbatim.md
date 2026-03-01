# Complex Multi-Integration Workflow - Verbatim Capture

Captured from user-provided text. Preserved as provided.

---

then add this Complex

Alright. Let's trace through a complex multi-integration workflow:
Task: "Every weekday morning, check my calendar, research the people I'm meeting, generate a briefing document with context about each person and their company, and email it to me 30 minutes before my first meeting"
This involves: OAuth integration, multiple data sources, conditional timing, document generation, iterative processing, partial failure handling, and dynamic scheduling.

PHASE 0: REQUIREMENTS DECOMPOSITION
Input Analysis
RAW REQUEST:
"Every weekday morning, check my calendar, research the people
I'm meeting, generate a briefing document with context about
each person and their company, and email it to me 30 minutes
before my first meeting"

EXTRACTED REQUIREMENTS:
┌─────────────────────────────────────────────────────────────┐
│ Trigger:      Weekday mornings (but WHEN exactly?)          │
│ Data Source:  User's calendar (which provider?)             │
│ Processing:   For each meeting attendee:                    │
│               - Research person                             │
│               - Research company                            │
│ Output:       Briefing document (format?)                   │
│ Delivery:     Email, 30 min before first meeting            │
│ Constraint:   Dynamic timing based on calendar              │
└─────────────────────────────────────────────────────────────┘

AMBIGUITIES DETECTED:
1. Calendar provider not specified (Google? Outlook? Apple?)
2. "Research" is vague - what sources? How deep?
3. Document format not specified (PDF? Email body? Markdown?)
4. "First meeting" - first meeting with external attendees? Any meeting?
5. What if no meetings? What if first meeting is at 6 AM?
6. What about recurring 1:1s with same people? Re-research each time?
Decision Point 0: Information Gathering Strategy
OPTION A: Ask all questions upfront
  - Pros: Complete information before starting
  - Cons: Overwhelming, user might abandon

OPTION B: Ask critical questions, default the rest
  - Pros: Faster to value
  - Cons: Might need to reconfigure later

OPTION C: Infer from context, confirm assumptions
  - Pros: Feels intelligent
  - Cons: Risk of wrong assumptions

DECISION: Option B + C hybrid
  - MUST ASK: Calendar provider (can't infer, need connection)
  - INFER: Research depth (start broad, user can refine)
  - DEFAULT: Document format (PDF, professional)
  - CONFIRM: Key assumptions before finalizing
Required Clarifications
BLOCKING_QUESTIONS = [
  "Which calendar? (Google Calendar, Outlook, etc.)",
]

NICE_TO_HAVE = [
  "Should I skip internal meetings (same company domain)?",
  "How early is too early? (What if first meeting is 5 AM?)",
  "Should I cache research for people you meet regularly?",
]

STRATEGY: Ask blocking question, mention I'll make smart defaults

PHASE 1: CONNECTION SETUP
Assuming user responds: "Google Calendar"
Step 1.1: Check Existing Connections
list_users_connections()

RESPONSE:
{
  connections: []  // No existing connections
}

STATE: Must create new Google Calendar connection
Step 1.2: Search for Integration
search_for_integrations({ keywords: ["google", "calendar"] })

RESPONSE:
[
  {
    integrationId: "google_calendar",
    name: "Google Calendar",
    quality: "GREAT",
    description: "Read and manage Google Calendar events"
  },
  ...
]
Step 1.3: Check Integration Capabilities
get_integrations_capabilities({ integrationIds: ["google_calendar"] })

RESPONSE:
{
  google_calendar: {
    tools: [
      "list_events",
      "get_event",
      "create_event",
      "update_event",
      "delete_event",
      "list_calendars"
    ],
    quality: "GREAT",
    notes: "Full read/write access to calendars"
  }
}

REQUIRED TOOLS FOR THIS TASK:
  - list_events ✓ (to get today's meetings)
  - get_event ✓ (to get attendee details)

TOOLS NOT NEEDED:
  - create_event, update_event, delete_event (read-only task)
Step 1.4: Create Connection
create_new_connections({
  connection: {
    type: "integrations",
    integrations: [{
      integrationId: "google_calendar",
      toolsToActivate: ["list_events"]  // Minimal permissions
    }]
  }
})

// UI card displayed to user
// User clicks "Connect" → OAuth flow
// User grants calendar read permission

RESPONSE:
{
  userAction: "created",
  connectionId: "conn_gcal_abc123",
  tools: {
    activated: ["list_events"],
    deactivated: ["get_event", "create_event", ...]
  }
}

STATE AFTER:
  - Connection: conn_gcal_abc123 (Google Calendar)
  - Activated tools: list_events
  - OAuth token: stored (managed by system)
Edge Case 1.4A: User denies OAuth permission
RESPONSE:
{
  userAction: "skipped"
}

HANDLING:
  - Cannot proceed without calendar access
  - Explain why it's needed
  - Offer to try again or use different calendar

MESSAGE TO USER:
"I need calendar access to see your meetings. Without it,
I can't generate briefings. Want to try connecting again?"
Edge Case 1.4B: User grants partial permissions
Google OAuth allows granular scopes
User might grant "read-only" but not "see attendee emails"

DETECTION:
  - First API call fails with permission error
  - Or returns events without attendee data

HANDLING:
  - Detect missing data in first execution
  - Explain what additional permission is needed
  - Offer reauthorize_connection
Edge Case 1.4C: OAuth token expires
Google tokens expire after ~1 hour (access token)
Refresh token can expire if unused for 6 months

DETECTION:
  - API call returns 401 Unauthorized
  - Tool error message indicates auth failure

HANDLING:
  - Call reauthorize_connection(connectionId)
  - Notify user if reauth fails
  - DO NOT delete trigger - just pause notifications

PHASE 2: ARCHITECTURE DESIGN
System Component Diagram
┌─────────────────────────────────────────────────────────────────┐
│                        TRIGGER LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐                                                │
│  │  Schedule   │  Fires at 5:00 AM local time                   │
│  │  Trigger    │  (Early to allow processing before meetings)   │
│  └──────┬──────┘                                                │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATION LAYER                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    MAIN AGENT CONTEXT                       ││
│  │  - Receives trigger event                                   ││
│  │  - Fetches calendar events                                  ││
│  │  - Dispatches research to subagent                          ││
│  │  - Aggregates results                                       ││
│  │  - Generates document                                       ││
│  │  - Sends email                                              ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
          │
          │ delegates
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUBAGENT LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │ Person Research  │  │ Company Research │                     │
│  │    Subagent      │  │    Subagent      │                     │
│  │                  │  │                  │                     │
│  │ - LinkedIn scrape│  │ - Company website│                     │
│  │ - News search    │  │ - Crunchbase     │                     │
│  │ - Social presence│  │ - News/funding   │                     │
│  └──────────────────┘  └──────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
          │
          │ stores/retrieves
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       DATA LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │   SQL Database   │  │    Filesystem    │                     │
│  │                  │  │                  │                     │
│  │ - Research cache │  │ - Generated PDFs │                     │
│  │ - Execution log  │  │ - Subagent files │                     │
│  │ - Meeting history│  │ - Templates      │                     │
│  └──────────────────┘  └──────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
Decision: Why Two Subagents?
ANALYSIS:
  - Person research: variable context size (LinkedIn profiles verbose)
  - Company research: separate data sources, different parsing
  - Coupling: loose (person research doesn't need company details to run)

ALTERNATIVES CONSIDERED:

A) Single "research" subagent
   - Simpler to manage
   - But: single failure affects all research
   - Context gets large with both person + company data

B) No subagents (all in main context)
   - Simpler architecture
   - But: context bloat after researching 5+ people
   - Hard to parallelize conceptually

C) Per-person subagent invocation
   - Maximum isolation
   - But: overhead of many subagent calls

DECISION: Two specialized subagents (B modified)
  - Person subagent: handles one person at a time
  - Company subagent: handles one company at a time
  - Invoke iteratively, aggregate in main context
  - Cache results to avoid re-research
Database Schema Design
-- Research cache (avoid re-researching known contacts)
CREATE TABLE person_research_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    linkedin_url TEXT,
    current_title TEXT,
    current_company TEXT,
    summary TEXT,           -- AI-generated summary
    raw_data TEXT,          -- JSON blob of all findings
    researched_at TEXT,
    expires_at TEXT         -- Cache expiry (30 days?)
);

-- Company cache
CREATE TABLE company_research_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT UNIQUE NOT NULL,
    company_name TEXT,
    description TEXT,
    industry TEXT,
    employee_count TEXT,
    funding_info TEXT,
    recent_news TEXT,       -- JSON array of news items
    raw_data TEXT,
    researched_at TEXT,
    expires_at TEXT
);

-- Execution log for debugging
CREATE TABLE briefing_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_date TEXT,
    trigger_time TEXT,
    meetings_found INTEGER,
    people_researched INTEGER,
    companies_researched INTEGER,
    cache_hits INTEGER,
    briefing_sent_at TEXT,
    first_meeting_time TEXT,
    status TEXT,            -- 'success', 'partial', 'failed'
    error_log TEXT
);

-- Meeting tracking (to show user meeting history)
CREATE TABLE meeting_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_date TEXT,
    meeting_title TEXT,
    attendee_emails TEXT,   -- JSON array
    briefing_execution_id INTEGER,
    FOREIGN KEY (briefing_execution_id) REFERENCES briefing_executions(id)
);
Edge Case 2A: Cache invalidation
SCENARIO:
  - Researched "Jane Doe" 3 months ago
  - She changed jobs since then
  - Cached data is stale

STRATEGIES:

Time-based expiry:
  - expires_at = researched_at + 30 days
  - Simple, predictable
  - But: doesn't account for change likelihood

Smart expiry:
  - Senior people: longer cache (stable)
  - Junior people: shorter cache (more job changes)
  - Recently funded companies: shorter cache (rapid changes)

Hybrid approach:
  - Use time-based as baseline (30 days)
  - On each use, do lightweight freshness check
  - If LinkedIn title differs from cache → full refresh

IMPLEMENTATION: Time-based with 30-day expiry (simple, good enough)

PHASE 3: SUBAGENT DESIGN
Person Research Subagent
# File: /agent/subagents/person-researcher.md

## Purpose
Research a single person given their email and name.

## Input (via payload JSON)
{
  "email": "jane.doe@company.com",
  "name": "Jane Doe",              // May be empty
  "meeting_context": "Product Demo" // Optional: meeting title for context
}

## Instructions

1. EXTRACT DOMAIN from email
   - jane.doe@company.com → company.com
   - This hints at their employer (but they might have personal email)

2. SEARCH for the person
   - Query: "{name} {company if known} LinkedIn"
   - Query: "{name} {domain}"

3. SCRAPE LinkedIn profile (if found)
   - web_scrape_website on LinkedIn URL
   - Extract: title, company, summary, experience
   - NOTE: LinkedIn may block scraping - handle gracefully

4. SEARCH for recent mentions
   - Query: "{name} {company} news"
   - Look for: interviews, announcements, promotions

5. COMPILE summary
   - Current role and company
   - Career trajectory (brief)
   - Notable achievements
   - Talking points relevant to meeting context

## Output Format (JSON)
{
  "success": true,
  "email": "jane.doe@company.com",
  "name": "Jane Doe",
  "linkedin_url": "https://linkedin.com/in/janedoe",
  "current_title": "VP of Product",
  "current_company": "TechCorp",
  "summary": "Jane Doe is VP of Product at TechCorp. She joined in 2024
               from Google where she led the Workspace product team. She's
               been quoted in TechCrunch discussing AI product strategy.",
  "talking_points": [
    "Former Google PM - might appreciate enterprise-grade reliability",
    "Vocal about AI ethics in recent interview"
  ],
  "confidence": "high",  // high/medium/low based on data quality
  "sources": ["linkedin.com", "techcrunch.com"],
  "error": null
}

## Error Handling
- If LinkedIn blocked: try other sources, note limitation
- If person not found: return success=false, include search attempts
- If multiple matches: return most likely based on company match

## Important
- DO NOT fabricate information
- If uncertain, say so in the summary
- Return valid JSON always
Company Research Subagent
# File: /agent/subagents/company-researcher.md

## Purpose
Research a company given its domain or name.

## Input (via payload JSON)
{
  "domain": "company.com",
  "company_name": "TechCorp",    // May be empty, infer from domain
  "industry_hint": "SaaS"        // Optional context
}

## Instructions

1. IDENTIFY the company
   - If domain provided: scrape company website
   - Extract: company name, tagline, what they do

2. SEARCH for company information
   - Query: "{company_name} company"
   - Query: "{company_name} crunchbase funding"
   - Query: "{company_name} news"

3. SCRAPE key pages
   - Company about page
   - Crunchbase profile (if available)
   - Recent news articles (1-2)

4. COMPILE company profile
   - What they do (one paragraph)
   - Size and stage
   - Recent news/funding
   - Competitive landscape (brief)

## Output Format (JSON)
{
  "success": true,
  "domain": "company.com",
  "company_name": "TechCorp",
  "tagline": "Enterprise AI Platform",
  "description": "TechCorp builds AI tools for enterprise...",
  "industry": "Enterprise Software / AI",
  "employee_count": "100-500",
  "funding": {
    "total_raised": "$50M",
    "last_round": "Series B, $30M, Jan 2025",
    "investors": ["a]6z", "Sequoia"]
  },
  "recent_news": [
    {"title": "TechCorp launches new product", "date": "2026-01-15", "url": "..."}
  ],
  "competitors": ["Competitor1", "Competitor2"],
  "confidence": "high",
  "error": null
}

## Error Handling
- If company website down: use search results
- If private company (no Crunchbase): note "Private, limited info"
- If domain is personal (gmail.com): return success=false, not a company

PHASE 4: TRIGGER TIMING ANALYSIS
The Dynamic Timing Problem
REQUIREMENT: Email 30 minutes before first meeting

PROBLEM:
  - Trigger fires at fixed time (e.g., 5 AM)
  - First meeting time varies daily
  - Can't schedule dynamic triggers

EXAMPLE SCENARIOS:
  Day 1: First meeting at 9:00 AM → Email at 8:30 AM
  Day 2: First meeting at 10:30 AM → Email at 10:00 AM
  Day 3: First meeting at 7:00 AM → Email at 6:30 AM
  Day 4: No meetings → No email

APPROACHES:

A) Fixed early trigger + delayed send
   - Trigger at 5 AM
   - Calculate delay until (first_meeting - 30min)
   - Problem: Can't "sleep" or schedule within execution

B) Fixed trigger + immediate send with note
   - Trigger at 6 AM
   - Send immediately with "Your first meeting is at X"
   - User gets briefing early, not exactly 30 min before
   - ACCEPTABLE TRADEOFF

C) Multiple triggers throughout morning
   - Triggers at 6 AM, 7 AM, 8 AM, 9 AM
   - Each checks: is first meeting in next 30-60 min?
   - If yes: send briefing (if not already sent)
   - More accurate timing, more complexity

D) External scheduler integration
   - Use calendar trigger (if available) on event start
   - Problem: Need trigger 30 min before, not at event time

DECISION: Option B (Fixed trigger, immediate send)
  - Trigger at 6:00 AM local time
  - Send briefing immediately
  - Include "Your first meeting is at [TIME]" prominently
  - User can review at leisure before meetings start

RATIONALE:
  - Simple, reliable
  - Covers edge cases (very early meetings)
  - User has time to review
  - No complex timing logic
Trigger Configuration
search_triggers({ keywords: ["schedule"] })

// Found: schedule trigger with cron support

setup_trigger({
  trigger_id: "schedule",
  params: {
    // 6:00 AM in user's timezone (GMT+8)
    // = 22:00 UTC previous day
    cron: "0 22 * * 0-4"  // Sun-Thu 22:00 UTC = Mon-Fri 6:00 AM GMT+8
  }
})

TIMEZONE CALCULATION:
  User timezone: GMT+8
  Desired local time: 6:00 AM
  UTC equivalent: 6:00 - 8 = 22:00 (previous day)

  Monday 6 AM GMT+8 = Sunday 22:00 UTC
  So cron days: 0-4 (Sun-Thu) to fire Mon-Fri local
Edge Case 4A: Daylight saving time
SCENARIO: User's timezone observes DST

GMT+8 (Singapore): No DST, always +8
GMT+0 (London): Has DST (GMT vs BST)

If user in DST-observing zone:
  - Cron runs in UTC (no DST)
  - Local time shifts by 1 hour twice a year
  - Briefing arrives at 5 AM or 7 AM instead of 6 AM

HANDLING:
  - Detect DST-observing timezones
  - Warn user about ±1 hour variation
  - Or: adjust cron twice yearly (manual)

CURRENT USER: GMT+8 (no DST) - not affected
Edge Case 4B: User travels to different timezone
SCENARIO: User normally in GMT+8, travels to GMT-5

IMPACT:
  - Trigger fires at 22:00 UTC
  - That's 17:00 (5 PM) in GMT-5
  - User gets "morning briefing" in afternoon

HANDLING OPTIONS:
  1. Ignore (assume user checks calendar on phone anyway)
  2. Detect timezone change via calendar event locations
  3. Let user manually pause/adjust trigger

IMPLEMENTATION: Document limitation, user can adjust if needed

PHASE 5: EXECUTION TRACE (TRIGGER FIRES)
State at Trigger Fire
TIMESTAMP: Mon, 16 Feb 2026 06:00:00 GMT+8 (22:00 UTC previous day)

SYSTEM MESSAGE:
{
  type: "trigger_event",
  trigger_id: "schedule",
  instance_id: "tri_briefing_123",
  fired_at: "2026-02-15T22:00:00Z"
}

CONTEXT STATE:
  - Fresh context (no conversation history)
  - System prompt loaded
  - Active connections: conn_gcal_abc123
  - Activated tools: conn_gcal_abc123__list_events
Step 5.1: Initialize Execution Record
INSERT INTO briefing_executions (
  execution_date, trigger_time, status
) VALUES (
  '2026-02-16', '2026-02-16T06:00:00+08:00', 'running'
);

-- Returns: execution_id = 42

STATE: Execution record created, can track progress
Step 5.2: Fetch Today's Calendar Events
conn_gcal_abc123__list_events({
  timeMin: "2026-02-16T00:00:00+08:00",
  timeMax: "2026-02-16T23:59:59+08:00",
  singleEvents: true,
  orderBy: "startTime"
})

RESPONSE:
{
  items: [
    {
      id: "event_1",
      summary: "Team Standup",
      start: { dateTime: "2026-02-16T09:00:00+08:00" },
      end: { dateTime: "2026-02-16T09:30:00+08:00" },
      attendees: [
        { email: "alice@mycompany.com", displayName: "Alice Chen" },
        { email: "bob@mycompany.com", displayName: "Bob Smith" }
      ]
    },
    {
      id: "event_2",
      summary: "Product Demo - TechCorp",
      start: { dateTime: "2026-02-16T10:00:00+08:00" },
      end: { dateTime: "2026-02-16T11:00:00+08:00" },
      attendees: [
        { email: "jane.doe@techcorp.com", displayName: "Jane Doe" },
        { email: "mike.wilson@techcorp.com", displayName: "Mike Wilson" },
        { email: "me@mycompany.com", displayName: "Zheyi Lim" }
      ]
    },
    {
      id: "event_3",
      summary: "Lunch",
      start: { dateTime: "2026-02-16T12:00:00+08:00" },
      end: { dateTime: "2026-02-16T13:00:00+08:00" },
      attendees: []  // No attendees, personal block
    },
    {
      id: "event_4",
      summary: "Investor Call - VC Partners",
      start: { dateTime: "2026-02-16T14:00:00+08:00" },
      end: { dateTime: "2026-02-16T15:00:00+08:00" },
      attendees: [
        { email: "sarah.investor@vcpartners.com", displayName: "Sarah Investor" }
      ]
    }
  ]
}

STATE:
  - 4 events found
  - 3 with external attendees worth researching
  - First meeting: 9:00 AM (Team Standup - internal)
  - First EXTERNAL meeting: 10:00 AM (Product Demo)
Edge Case 5.2A: Calendar API returns error
POSSIBLE ERRORS:
  - 401: Token expired
  - 403: Permission revoked
  - 429: Rate limited
  - 500: Google server error
  - Timeout: Network issue

HANDLING BY ERROR TYPE:

401/403 (Auth error):
  UPDATE briefing_executions
  SET status = 'failed', error_log = 'Calendar auth expired'
  WHERE id = 42;

  send_message({
    to: ["owner"],
    subject: "⚠️ Morning Briefing Failed - Calendar Access Needed",
    body: "I couldn't generate your briefing because calendar
           access expired. Please reconnect your calendar."
  })

  // Create task for follow-up
  manage_tasks({ operations: [{
    operation: "add",
    title: "Fix calendar connection for briefings",
    payload: { connectionId: "conn_gcal_abc123" }
  }]})

  STOP EXECUTION

429 (Rate limit):
  // Rare for calendar reads, but possible
  UPDATE briefing_executions
  SET status = 'failed', error_log = 'Rate limited'
  WHERE id = 42;

  // Don't notify user - transient error
  // Next day's trigger will likely succeed

  STOP EXECUTION

500/Timeout (Transient):
  // Retry once after 30 seconds
  // If still fails, log and stop
  // Don't notify user for single failure
Edge Case 5.2B: No events today
RESPONSE: { items: [] }

HANDLING:
  UPDATE briefing_executions
  SET meetings_found = 0, status = 'success',
      error_log = 'No meetings today'
  WHERE id = 42;

  // Option A: Send "No meetings" email
  // Option B: Skip email entirely

  DECISION: Skip email (less noise)

  STOP EXECUTION (success, no action needed)
Edge Case 5.2C: Only internal meetings
All attendees have @mycompany.com domain

DETECTION:
  user_domain = extract_domain("limzheyi1996@gmail.com") // gmail.com? personal email

  // Hmm, user has personal email - can't detect "internal"

ALTERNATIVE DETECTION:
  - Check if all attendees are in a "known colleagues" list
  - Or: treat all meetings with multiple attendees as worth briefing
  - Or: ask user during setup for their company domain

DECISION FOR NOW:
  - Research anyone not in previous meetings (new contacts)
  - Cache means repeated attendees get skipped anyway
Step 5.3: Filter and Classify Meetings
# Conceptual logic (not executing)

meetings_to_brief = []
all_attendees = {}

for event in calendar_events:
    # Skip events with no attendees (personal blocks)
    if not event.attendees:
        continue

    # Skip events where user is only attendee
    external_attendees = [
        a for a in event.attendees
        if a.email != user_email
    ]

    if not external_attendees:
        continue

    meetings_to_brief.append({
        'title': event.summary,
        'time': event.start,
        'attendees': external_attendees
    })

    # Dedupe attendees across meetings
    for attendee in external_attendees:
        if attendee.email not in all_attendees:
            all_attendees[attendee.email] = {
                'name': attendee.displayName,
                'meetings': []
            }
        all_attendees[attendee.email]['meetings'].append(event.summary)

RESULT:
  meetings_to_brief = [
    { title: "Team Standup", attendees: [alice, bob] },
    { title: "Product Demo - TechCorp", attendees: [jane, mike] },
    { title: "Investor Call", attendees: [sarah] }
  ]

  all_attendees = {
    "alice@mycompany.com": { name: "Alice Chen", meetings: ["Team Standup"] },
    "bob@mycompany.com": { name: "Bob Smith", meetings: ["Team Standup"] },
    "jane.doe@techcorp.com": { name: "Jane Doe", meetings: ["Product Demo"] },
    "mike.wilson@techcorp.com": { name: "Mike Wilson", meetings: ["Product Demo"] },
    "sarah.investor@vcpartners.com": { name: "Sarah Investor", meetings: ["Investor Call"] }
  }

UNIQUE ATTENDEES TO RESEARCH: 5
UNIQUE COMPANIES TO RESEARCH: 3 (mycompany.com, techcorp.com, vcpartners.com)
Step 5.4: Check Research Cache
-- Check which people are already cached
SELECT email, full_name, summary, researched_at, expires_at
FROM person_research_cache
WHERE email IN (
  'alice@mycompany.com',
  'bob@mycompany.com',
  'jane.doe@techcorp.com',
  'mike.wilson@techcorp.com',
  'sarah.investor@vcpartners.com'
) AND expires_at > CURRENT_TIMESTAMP;

RESULT:
┌─────────────────────────────┬────────────────┬──────────────┐
│ email                       │ full_name      │ expires_at   │
├─────────────────────────────┼────────────────┼──────────────┤
│ alice@mycompany.com         │ Alice Chen     │ 2026-03-01   │ (CACHED)
│ bob@mycompany.com           │ Bob Smith      │ 2026-03-01   │ (CACHED)
└─────────────────────────────┴────────────────┴──────────────┘

CACHE HITS: 2 (alice, bob)
NEED TO RESEARCH: 3 (jane, mike, sarah)

-- Similarly for companies
SELECT domain, company_name, description
FROM company_research_cache
WHERE domain IN ('mycompany.com', 'techcorp.com', 'vcpartners.com')
AND expires_at > CURRENT_TIMESTAMP;

RESULT:
┌─────────────────┬──────────────┐
│ domain          │ company_name │
├─────────────────┼──────────────┤
│ mycompany.com   │ My Company   │ (CACHED - user's own company)
└─────────────────┴──────────────┘

NEED TO RESEARCH COMPANIES: 2 (techcorp.com, vcpartners.com)
Step 5.5: Research Loop
FOR EACH person in [jane, mike, sarah]:

  ┌─────────────────────────────────────────────┐
  │ ITERATION 1: jane.doe@techcorp.com          │
  └─────────────────────────────────────────────┘

  run_subagent({
    path: "/agent/subagents/person-researcher.md",
    payload: JSON.stringify({
      email: "jane.doe@techcorp.com",
      name: "Jane Doe",
      meeting_context: "Product Demo - TechCorp"
    })
  })

  SUBAGENT EXECUTION (isolated context):

    1. web_search_web({ query: "Jane Doe TechCorp LinkedIn" })
       → Returns search results with LinkedIn profile URL

    2. web_scrape_website({ url: "https://linkedin.com/in/janedoe" })
       → POSSIBLE OUTCOMES:
          A) Success: Returns profile HTML/markdown
          B) Blocked: LinkedIn returns login wall
          C) Rate limited: HTTP 429
          D) Profile not found: HTTP 404

       ASSUMING: B (LinkedIn blocks scraping)

    3. FALLBACK: Use search result snippets
       web_search_web({ query: "Jane Doe VP Product TechCorp" })
       → Snippets contain title, company from various sources

    4. web_search_web({ query: "Jane Doe TechCorp news" })
       → Find recent mentions, interviews

    5. Compile from available data

  SUBAGENT RETURNS:
  {
    "success": true,
    "email": "jane.doe@techcorp.com",
    "name": "Jane Doe",
    "linkedin_url": "https://linkedin.com/in/janedoe",
    "current_title": "VP of Product",
    "current_company": "TechCorp",
    "summary": "Jane Doe is VP of Product at TechCorp. She joined in 2024
               from Google where she led the Workspace product team. She's
               been quoted in TechCrunch discussing AI product strategy.",
    "talking_points": [
      "Former Google PM - might appreciate enterprise-grade reliability",
      "Vocal about AI ethics in recent interview"
    ],
    "confidence": "medium",  // LinkedIn blocked, data from secondary sources
    "sources": ["google search", "techcrunch.com"],
    "error": null
  }

  MAIN CONTEXT: Cache the result

  INSERT INTO person_research_cache (
    email, full_name, linkedin_url, current_title,
    current_company, summary, raw_data, researched_at, expires_at
  ) VALUES (
    'jane.doe@techcorp.com', 'Jane Doe', 'https://linkedin.com/in/janedoe',
    'VP of Product', 'TechCorp', '...summary...', '...json...',
    CURRENT_TIMESTAMP, datetime('now', '+30 days')
  );

  ┌─────────────────────────────────────────────┐
  │ ITERATION 2: mike.wilson@techcorp.com       │
  └─────────────────────────────────────────────┘

  // Similar process...
  // Mike is from same company as Jane, company research can be shared

  ┌─────────────────────────────────────────────┐
  │ ITERATION 3: sarah.investor@vcpartners.com  │
  └─────────────────────────────────────────────┘

  // Similar process...
Edge Case 5.5A: Person research completely fails
SUBAGENT RETURNS:
{
  "success": false,
  "email": "mystery@unknowndomain.com",
  "error": "Could not find any information about this person"
}

HANDLING:
  - Include in briefing with note: "No public information found"
  - Still list their name and email
  - Don't cache failures (might find info later)
  - Confidence: "none"
Edge Case 5.5B: Subagent times out
run_subagent default timeout: 60 seconds
Complex research might exceed this

DETECTION:
  - Tool returns timeout error

HANDLING:
  - Log the timeout
  - Continue with other attendees
  - Mark this person as "Research incomplete"
  - Don't fail entire briefing for one person
Edge Case 5.5C: Rate limiting across searches
Researching 5 people = ~15 web searches
Google might rate limit

DETECTION:
  - Search results return errors or CAPTCHAs

HANDLING IN SUBAGENT:
  - Return partial results with error note
  - Main context aggregates what's available

MITIGATION:
  - Cache aggressively (reduces searches over time)
  - Spread research over multiple subagent calls (natural delays)
Step 5.6: Company Research
FOR EACH company in [techcorp.com, vcpartners.com]:

  ┌─────────────────────────────────────────────┐
  │ COMPANY: techcorp.com                       │
  └─────────────────────────────────────────────┘

  run_subagent({
    path: "/agent/subagents/company-researcher.md",
    payload: JSON.stringify({
      domain: "techcorp.com",
      company_name: "TechCorp"  // Extracted from person research
    })
  })

  SUBAGENT RETURNS:
  {
    "success": true,
    "domain": "techcorp.com",
    "company_name": "TechCorp",
    "tagline": "AI-powered enterprise solutions",
    "description": "TechCorp builds AI tools for enterprise workflow
                    automation. Founded in 2020, they've grown to 200
                    employees and serve Fortune 500 clients.",
    "industry": "Enterprise Software / AI",
    "employee_count": "200-500",
    "funding": {
      "total_raised": "$75M",
      "last_round": "Series B, $50M, October 2025",
      "investors": ["Sequoia", "a16z"]
    },
    "recent_news": [
      {
        "title": "TechCorp announces enterprise AI assistant",
        "date": "2026-01-20",
        "summary": "New product directly competes with our offering"
      }
    ],
    "competitors": ["CompetitorA", "CompetitorB", "Us?"],
    "confidence": "high"
  }

  // Cache result
  INSERT INTO company_research_cache (...) VALUES (...);
Edge Case 5.6A: Domain is a generic email provider
email: "contact@gmail.com" or "ceo@yahoo.com"

DETECTION:
  generic_domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', ...]

  if domain in generic_domains:
    skip_company_research = True

HANDLING:
  - Don't research "Gmail" as a company
  - In briefing, note: "Personal email, company unknown"
Edge Case 5.6B: Company is a direct competitor
Company research reveals they're a competitor

DETECTION:
  - Manual: Include user's company in "competitors" list during setup
  - Auto: Compare company descriptions for overlap

SPECIAL HANDLING:
  - Flag prominently in briefing: "⚠️ COMPETITOR"
  - Include competitive intelligence
  - Note recent product launches that might come up
Step 5.7: Generate Briefing Document
AGGREGATE ALL RESEARCH:

meetings = [
  {
    time: "9:00 AM",
    title: "Team Standup",
    attendees: [
      { name: "Alice Chen", title: "Engineer", summary: "...", company: { name: "My Company", ... }},
      { name: "Bob Smith", ... }
    ]
  },
  {
    time: "10:00 AM",
    title: "Product Demo - TechCorp",
    attendees: [
      { name: "Jane Doe", title: "VP Product", summary: "Former Google PM...",
        company: { name: "TechCorp", funding: "$75M", recent_news: [...] }},
      { name: "Mike Wilson", ... }
    ]
  },
  {
    time: "2:00 PM",
    title: "Investor Call",
    attendees: [
      { name: "Sarah Investor", title: "Partner", summary: "...",
        company: { name: "VC Partners", portfolio: [...] }}
    ]
  }
]

GENERATE DOCUMENT:

# Option A: Markdown → PDF
write_file({
  path: "/agent/home/briefings/2026-02-16-briefing.md",
  content: `
# Daily Briefing - Monday, February 16, 2026

## 📅 Your Day at a Glance
- **First meeting:** 9:00 AM - Team Standup
- **Key external meeting:** 10:00 AM - Product Demo with TechCorp
- **Total meetings:** 4

---

## 🤝 10:00 AM - Product Demo - TechCorp

### Company: TechCorp
- **Industry:** Enterprise Software / AI
- **Size:** 200-500 employees
- **Funding:** $75M raised (Series B, Oct 2025)
- **Recent News:** Announced enterprise AI assistant (Jan 2026)
- **Note:** Their new product may compete with ours

### Attendees

#### Jane Doe - VP of Product
- Joined TechCorp in 2024 from Google (Workspace PM)
- Quoted in TechCrunch on AI product strategy
- **Talking points:**
  - Former Google PM - values enterprise reliability
  - Interested in AI ethics

#### Mike Wilson - Senior Engineer
- 5 years at TechCorp
- Leads their API team
- **Talking points:**
  - Technical decision-maker
  - Ask about their integration requirements

---

## 💰 2:00 PM - Investor Call - VC Partners

### Company: VC Partners
- **Focus:** Enterprise SaaS, Series A-B
- **AUM:** $500M
- **Notable investments:** CompanyX, CompanyY

### Attendees

#### Sarah Investor - Partner
- 10 years in VC
- Previously operator at Stripe
- **Talking points:**
  - Asks tough questions about unit economics
  - Values founder market fit

---

*Generated at 6:00 AM by your briefing assistant*
`
})

# Convert to PDF
run_command({
  command: "pandoc /agent/home/briefings/2026-02-16-briefing.md -o /agent/home/briefings/2026-02-16-briefing.pdf --pdf-engine=wkhtmltopdf"
})

// Note: May need different PDF approach if pandoc/wkhtmltopdf not available
// Fallback: send as formatted email body instead of PDF attachment
Edge Case 5.7A: PDF generation fails
pandoc might not be installed or might fail

DETECTION:
  run_command returns non-zero exit code

FALLBACK:
  - Send markdown content as email body
  - Format nicely with headers
  - Note: "PDF version unavailable, see content below"
Edge Case 5.7B: Document too long
20 meetings, 30 attendees → massive document

MITIGATION:
  - Summarize more aggressively for large days
  - Focus on external meetings
  - Collapse internal meetings to one-liners
  - Paginate or split by time block
Step 5.8: Send Email
send_message({
  to: ["owner"],
  subject: "📋 Your Daily Briefing - Monday, Feb 16 (First meeting: 9:00 AM)",
  body: `
Good morning! Here's your briefing for today.

**Key meetings:**
- 10:00 AM - Product Demo with TechCorp (Jane Doe, Mike Wilson)
- 2:00 PM - Investor Call with VC Partners (Sarah Investor)

See the attached PDF for full details on each attendee and company.

---
*You have 4 meetings today. Your first meeting is at 9:00 AM.*
`,
  attachments: ["/agent/home/briefings/2026-02-16-briefing.pdf"]
})

RESPONSE:
{
  success: true,
  messageId: "msg_xyz789"
}
Edge Case 5.8A: Email with attachment fails
Attachment too large, or attachment feature fails

FALLBACK:
  - Send email without attachment
  - Include full content in email body
  - Or: save PDF and provide download link
Step 5.9: Update Execution Log
UPDATE briefing_executions SET
  meetings_found = 4,
  people_researched = 3,
  companies_researched = 2,
  cache_hits = 2,
  briefing_sent_at = CURRENT_TIMESTAMP,
  first_meeting_time = '2026-02-16T09:00:00+08:00',
  status = 'success'
WHERE id = 42;

-- Record meetings for history
INSERT INTO meeting_history (meeting_date, meeting_title, attendee_emails, briefing_execution_id)
VALUES
  ('2026-02-16', 'Product Demo - TechCorp', '["jane.doe@techcorp.com","mike.wilson@techcorp.com"]', 42),
  ('2026-02-16', 'Investor Call', '["sarah.investor@vcpartners.com"]', 42);

PHASE 6: COMPREHENSIVE EDGE CASE CATALOG
6.1 Calendar Edge Cases
┌─────────────────────────────────────────────────────────────────┐
│ EDGE CASE                      │ DETECTION           │ HANDLING │
├────────────────────────────────┼─────────────────────┼──────────┤
│ All-day event                  │ start.date vs       │ Include  │
│                                │ start.dateTime      │ but note │
├────────────────────────────────┼─────────────────────┼──────────┤
│ Recurring meeting,             │ recurringEventId    │ Research │
│ same attendees                 │ + cache hit         │ once     │
├────────────────────────────────┼─────────────────────┼──────────┤
│ Tentative/declined event       │ attendee.response   │ Skip if  │
│                                │ Status              │ declined │
├────────────────────────────────┼─────────────────────┼──────────┤
│ Private event (hidden details) │ visibility=private  │ Show time│
│                                │                     │ only     │
├────────────────────────────────┼─────────────────────┼──────────┤
│ Event with 50+ attendees       │ attendees.length    │ Sample   │
│ (company all-hands)            │ > threshold         │ or skip  │
├────────────────────────────────┼─────────────────────┼──────────┤
│ Event on secondary calendar    │ Multiple calendars  │ Query    │
│                                │                     │ all cals │
├────────────────────────────────┼─────────────────────┼──────────┤
│ Event created after briefing   │ N/A (already sent)  │ Accept   │
│ already sent                   │                     │ limitation│
└─────────────────────────────────────────────────────────────────┘
6.2 Research Edge Cases
┌─────────────────────────────────────────────────────────────────┐
│ EDGE CASE                      │ DETECTION           │ HANDLING │
├────────────────────────────────┼─────────────────────┼──────────┤
│ Common name (John Smith)       │ Multiple search     │ Use email│
│                                │ results             │ domain   │
├────────────────────────────────┼─────────────────────┼──────────┤
│ No online presence             │ Zero search results │ Note it  │
├────────────────────────────────┼─────────────────────┼──────────┤
│ Person recently changed jobs   │ Conflicting info    │ Show most│
│                                │ across sources      │ recent   │
├────────────────────────────────┼─────────────────────┼──────────┤
│ Person has same name as        │ Celebrity results   │ Filter by│
│ celebrity                      │ dominate search     │ company  │
├────────────────────────────────┼─────────────────────┼──────────┤
│ Stealth startup (no info)      │ Company website     │ Note     │
│                                │ minimal             │ "stealth"│
├────────────────────────────────┼─────────────────────┼──────────┤
│ Non-English sources            │ Search returns      │ Use      │
│                                │ foreign results     │ English  │
│                                │                     │ sources  │
├────────────────────────────────┼─────────────────────┼──────────┤
│ Defunct company                │ News about shutdown │ Note it  │
│                                │ or acquisition      │ clearly  │
└─────────────────────────────────────────────────────────────────┘
6.3 Timing Edge Cases
┌─────────────────────────────────────────────────────────────────┐
│ EDGE CASE                      │ SCENARIO            │ HANDLING │
├────────────────────────────────┼─────────────────────┼──────────┤
│ First meeting at 5 AM          │ User scheduled very │ Still    │
│                                │ early meeting       │ send at  │
│                                │                     │ 6 AM     │
├────────────────────────────────┼─────────────────────┼──────────┤
│ Processing takes too long      │ 20 people to        │ Set time │
│                                │ research = 30min?   │ limit    │
├────────────────────────────────┼─────────────────────┼──────────┤
│ Trigger fires but user is      │ Weekend/holiday     │ Cron     │
│ off                            │ not in schedule     │ handles  │
├────────────────────────────────┼─────────────────────┼──────────┤
│ System outage at trigger time  │ Trigger missed      │ System   │
│                                │                     │ handles  │
└─────────────────────────────────────────────────────────────────┘
6.4 Partial Failure Scenarios
SCENARIO: 3 of 5 people researched successfully

APPROACH:
  - Include all 5 in briefing
  - For successful: full profiles
  - For failed: minimal info (name, email, "research unavailable")
  - Log which failed and why

BRIEFING OUTPUT:
  ✓ Jane Doe - Full profile available
  ✓ Mike Wilson - Full profile available
  ⚠️ John Mystery - Could not find public information
  ✓ Sarah Investor - Full profile available
  ⚠️ Anonymous Person - Research timed out

USER VALUE: Partial briefing > no briefing

PHASE 7: OPTIMIZATION OPPORTUNITIES
7.1 Parallelization (Conceptual)
CURRENT: Sequential subagent calls
  research(jane) → wait → research(mike) → wait → research(sarah) → wait
  Total: ~3 minutes

LIMITATION: Subagent calls are synchronous
  Cannot spawn parallel subagents

WORKAROUND: Batch in single subagent
  - Create "batch-researcher" subagent
  - Pass all 5 people at once
  - Subagent internally processes sequentially but in one context
  - Returns all results together

TRADEOFF:
  - Faster (one subagent call vs five)
  - But: larger context in subagent
  - But: one failure could affect all
7.2 Incremental Briefings
CURRENT: Full briefing every day

OPTIMIZATION: Delta briefings
  - Track what user has seen before
  - For recurring meeting: "You last met Jane 2 weeks ago.
    Since then: She was promoted to SVP."
  - Reduce repetition, highlight changes

IMPLEMENTATION:
  Add column: last_included_in_briefing_at
  Compare research timestamps
  Generate "What's new" section
7.3 Preemptive Caching
CURRENT: Research on-demand when trigger fires

OPTIMIZATION: Research in advance
  - When user adds meeting, immediately queue research
  - Research happens in background before briefing day
  - Briefing generation becomes instant (all cached)

LIMITATION:
  - Would need calendar webhook trigger (event created)
  - More complexity
  - Might research for meetings that get cancelled

SUMMARY: Full State Machine
                                    ┌─────────────┐
                                    │   START     │
                                    └──────┬──────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │  Parse User Request    │
                              │  - Calendar provider?  │
                              │  - Timing preferences? │
                              └───────────┬────────────┘
                                          │
                              [Missing info?]
                                  │     │
                                 Yes    No
                                  │     │
                                  ▼     │
                         ┌─────────────┐ │
                         │  Ask User   │ │
                         └──────┬──────┘ │
                                │        │
                                ◄────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Setup Connection     │
                    │  - OAuth flow         │
                    │  - Activate tools     │
                    └───────────┬───────────┘
                                │
                       [Auth success?]
                           │      │
                          No     Yes
                           │      │
                           ▼      │
                    ┌────────────┐ │
                    │  Ask to    │ │
                    │  retry     │ │
                    └────────────┘ │
                                   │
                                   ▼
                    ┌───────────────────────┐
                    │  Create Schema/       │
                    │  Subagents            │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Setup Trigger        │
                    │  (Cron: 6 AM local)   │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  RUNNING              │◄─────────────────┐
                    │  (Await trigger)      │                  │
                    └───────────┬───────────┘                  │
                                │                              │
                         [Trigger fires]                       │
                                │                              │
                                ▼                              │
                    ┌───────────────────────┐                  │
                    │  Fetch Calendar       │                  │
                    └───────────┬───────────┘                  │
                                │                              │
                       [API success?]                          │
                           │      │                            │
                          No     Yes                           │
                           │      │                            │
                           ▼      │                            │
                    ┌────────────┐ │                           │
                    │  Handle    │ │                           │
                    │  error     │─┼───────────────────────────┤
                    │  (notify?) │ │                           │
                    └────────────┘ │                           │
                                   │                           │
                                   ▼                           │
                    ┌───────────────────────┐                  │
                    │  Filter meetings      │                  │
                    │  - External attendees │                  │
                    │  - Dedupe people      │                  │
                    └───────────┬───────────┘                  │
                                │                              │
                       [Any meetings?]                         │
                           │      │                            │
                          No     Yes                           │
                           │      │                            │
                           ▼      │                            │
                    ┌────────────┐ │                           │
                    │  Log "no   │ │                           │
                    │  meetings" │─┼───────────────────────────┤
                    └────────────┘ │                           │
                                   │                           │
                                   ▼                           │
                    ┌───────────────────────┐                  │
                    │  Check cache          │                  │
                    │  - People             │                  │
                    │  - Companies          │                  │
                    └───────────┬───────────┘                  │
                                │                              │
                                ▼                              │
                    ┌───────────────────────┐                  │
                    │  FOR EACH uncached:   │                  │
                    │  ┌─────────────────┐  │                  │
                    │  │ Run subagent    │  │                  │
                    │  │ - Web search    │  │                  │
                    │  │ - Scrape        │  │                  │
                    │  │ - Compile       │  │                  │
                    │  └────────┬────────┘  │                  │
                    │           │           │                  │
                    │    [Success?]         │                  │
                    │       │     │         │                  │
                    │      No    Yes        │                  │
                    │       │     │         │                  │
                    │       ▼     ▼         │                  │
                    │    ┌─────┐ ┌─────┐    │                  │
                    │    │Note │ │Cache│    │                  │
                    │    │fail │ │data │    │                  │
                    │    └─────┘ └─────┘    │                  │
                    └───────────┬───────────┘                  │
                                │                              │
                                ▼                              │
                    ┌───────────────────────┐                  │
                    │  Generate document    │                  │
                    │  - Aggregate data     │                  │
                    │  - Format markdown    │                  │
                    │  - Convert to PDF     │                  │
                    └───────────┬───────────┘                  │
                                │                              │
                                ▼                              │
                    ┌───────────────────────┐                  │
                    │  Send email           │                  │
                    │  - To: owner          │                  │
                    │  - Attach: PDF        │                  │
                    └───────────┬───────────┘                  │
                                │                              │
                                ▼                              │
                    ┌───────────────────────┐                  │
                    │  Log execution        │                  │
                    │  - Success/partial    │                  │
                    │  - Metrics            │                  │
                    └───────────┬───────────┘                  │
                                │                              │
                                └──────────────────────────────┘
                                        (next trigger)

That's the complete technical trace for a complex multi-integration workflow. Want me to:
1. Drill into any specific phase more deeply?
2. Trace a different complex scenario (e.g., multi-source data aggregation with conflict resolution)?
3. Explore failure recovery patterns in more detail?
4. Analyze the context/token economics of this workflow?
