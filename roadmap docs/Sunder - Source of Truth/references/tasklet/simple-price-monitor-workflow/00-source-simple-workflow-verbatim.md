# Simple Price Monitor Workflow - Verbatim Capture

Captured from user-provided text. Preserved as provided.

---

then add this Simple

PHASE 1: INITIAL REQUEST PARSING
Input State
user_message: "Monitor this product page for price drops and email me when it drops below $500"
url: (not provided)
threshold: $500
notification_channel: email
Decision Point 1: Missing Information Detection
My reasoning process:
REQUIRED_PARAMS = {
  url: NULL,           // MISSING - cannot proceed
  threshold: 500,      // PRESENT
  frequency: NULL,     // MISSING - but has reasonable default
  notification: email  // PRESENT (implicit: owner)
}

if (url == NULL) → HALT, ask user
Edge Case 1A: User provides malformed URL
input: "monitor example dot com"
parse_attempt: fails URL regex
action: ask for clarification, suggest format
Edge Case 1B: User provides URL requiring authentication
input: "https://internal.company.com/product/123"
detection: only discoverable at scrape time (HTTP 401/403)
action: must handle in Phase 3

PHASE 2: ARCHITECTURE DECISION
Once I have the URL, I must decide the execution architecture.
Decision Point 2: One-time vs Recurring
keyword_analysis:
  "monitor" → implies RECURRING
  "check"   → could be ONE_TIME or RECURRING
  "alert when" → implies RECURRING with condition

decision: RECURRING task
Decision Point 3: Execution Strategy Selection
OPTIONS:
  A) Direct execution in main context (no subagent)
  B) Subagent for scraping + main context for orchestration
  C) Full subagent delegation

EVALUATION:
  - Task involves: web scrape (high context) + parse + compare + notify
  - Recurrence: yes (trigger will re-invoke)
  - Context cost per run: ~2-5KB (page content)

DECISION: Option B
  - Create subagent for: scrape → parse → compare → return result
  - Main context handles: trigger setup, notification dispatch

RATIONALE:
  - Subagent isolates scraping context (doesn't pollute main)
  - Subagent can be reused across trigger invocations
  - Main context stays lean for orchestration decisions
Decision Point 4: State Persistence Strategy
STATE_REQUIREMENTS:
  - last_known_price: FLOAT
  - last_check_time: TIMESTAMP
  - price_history: ARRAY (optional, for trends)
  - notification_sent: BOOLEAN (prevent spam)

STORAGE_OPTIONS:
  A) SQL Database
     pros: queryable, atomic updates, structured
     cons: overkill for single-value tracking

  B) Filesystem (/agent/home/price_monitor.json)
     pros: simple, human-readable, easy debugging
     cons: no atomic operations, manual parsing

  C) Hybrid (DB for state, filesystem for logs)

DECISION: SQL Database
  - Need atomic read-modify-write for price comparison
  - Want to track history for potential trend analysis
  - Prevents race conditions if trigger fires overlap

PHASE 3: IMPLEMENTATION TRACE
Step 3.1: Database Schema Creation
-- Execution trace
run_agent_memory_sql({
  query: "CREATE TABLE IF NOT EXISTS price_monitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    target_price REAL NOT NULL,
    last_price REAL,
    last_checked_at TEXT,
    notification_sent_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )"
})

-- State after execution:
-- DB tables: 1 (price_monitors)
-- Rows: 0
Edge Case 3.1A: Table already exists (user re-runs setup)
IF NOT EXISTS clause handles this
No error thrown, schema unchanged
IDEMPOTENT: ✓
Step 3.2: Insert Monitor Record
INSERT INTO price_monitors (url, target_price)
VALUES ('https://example.com/product', 500.00)

-- State after:
-- Rows: 1
-- last_price: NULL (not yet scraped)
-- notification_sent_at: NULL
Step 3.3: Subagent Creation
# File: /agent/subagents/price-scraper.md

## Instructions

You scrape a product page and extract the current price.

INPUT (via payload):
- url: The product page URL
- monitor_id: Database record ID

PROCESS:
1. Call web_scrape_website(url)
2. Parse response for price (look for: $X.XX, data-price attributes, JSON-LD)
3. Query current state from DB
4. Compare prices, update DB
5. Return structured result

OUTPUT FORMAT:
{
  "success": boolean,
  "current_price": number | null,
  "previous_price": number | null,
  "price_changed": boolean,
  "error": string | null
}

ERROR HANDLING:
- HTTP errors: return success=false with error message
- Parse failures: return success=false, attempt to include raw snippet
- DB errors: return success=false with error

DO NOT send notifications - parent handles that.
Edge Case 3.3A: Subagent file already exists
write_file with op="write" overwrites
Previous version lost
CONSIDERATION: Should I check first?
  - If user is re-configuring, overwrite is correct
  - If unrelated subagent has same name, data loss
  - MITIGATION: Use descriptive unique names
Step 3.4: Initial Scrape (Validation Run)
Before setting up the trigger, I should validate the URL is scrapeable.
run_subagent({
  path: "/agent/subagents/price-scraper.md",
  payload: JSON.stringify({
    url: "https://example.com/product",
    monitor_id: 1
  })
})
Subagent Internal Execution Trace:
STEP 1: web_scrape_website("https://example.com/product")

POSSIBLE OUTCOMES:
┌─────────────────────────────────────────────────────────────┐
│ HTTP 200 + Content    → Continue to parsing                 │
│ HTTP 401/403          → Auth required, return error         │
│ HTTP 404              → Page not found, return error        │
│ HTTP 429              → Rate limited, return error          │
│ HTTP 5xx              → Server error, return error          │
│ Timeout               → Network issue, return error         │
│ SSL Error             → Certificate issue, return error     │
│ Content but no price  → Parse failure, return error         │
└─────────────────────────────────────────────────────────────┘
Edge Case 3.4A: JavaScript-rendered prices
web_scrape_website returns RAW HTML
If price is injected via JavaScript:
  - HTML contains: <span id="price"></span>
  - JS would populate it, but we don't execute JS
  - Price extraction FAILS

DETECTION:
  - Empty price containers
  - Presence of heavy JS frameworks
  - "Loading..." placeholders in content

MITIGATION OPTIONS:
  1. Inform user: "This page uses JavaScript rendering.
     I'd need browser automation (Computer Use) to scrape it."
  2. Check for API endpoints in page source
  3. Look for JSON-LD structured data (often server-rendered)
Edge Case 3.4B: Price exists in multiple formats
Page contains:
  - "$499.99" (display price)
  - "$599.99" crossed out (original price)
  - "$479.99" (member price)

PARSING AMBIGUITY:
  - Regex finds multiple matches
  - Which is "the" price?

HEURISTICS:
  1. Look for schema.org/Product markup (authoritative)
  2. Look for data-price or data-current-price attributes
  3. Take the first prominent price in main content area
  4. If still ambiguous, return all found + ask user
Edge Case 3.4C: Price in non-USD currency
Page shows: "€459.99" or "£399.99"

CONSIDERATIONS:
  - User said "$500" - implies USD
  - Should I convert? (introduces forex dependency)
  - Should I warn user about currency mismatch?

DECISION: Return raw price + currency, let parent handle
Subagent Parse Logic Trace:
# Conceptual trace (not actual code execution)

content = scrape_result.markdown

# Attempt 1: JSON-LD structured data
json_ld_match = regex(r'<script type="application/ld\+json">(.*?)</script>')
if json_ld_match:
    data = parse_json(json_ld_match)
    if data.get('@type') == 'Product':
        price = data.get('offers', {}).get('price')
        # FOUND via structured data ✓

# Attempt 2: Common price patterns
price_patterns = [
    r'\$[\d,]+\.?\d*',           # $499.99
    r'USD\s*[\d,]+\.?\d*',       # USD 499.99
    r'data-price="([\d.]+)"',   # data attribute
]

# Attempt 3: Semantic HTML
price_elements = [
    '.price', '.product-price', '#price',
    '[itemprop="price"]', '.current-price'
]
Step 3.5: Trigger Setup
search_triggers({ keywords: ["schedule"] })

// Returns available trigger types
// Select: schedule trigger for periodic checks
setup_trigger({
  trigger_id: "schedule",
  params: {
    cron: "0 */6 * * *"  // Every 6 hours
  }
})
Edge Case 3.5A: User wants "check every few hours"
Vague frequency specification

INTERPRETATION OPTIONS:
  "few" typically means 2-4

DECISION: Ask user or default to 6 hours
  - Too frequent: wastes resources, might get rate-limited
  - Too infrequent: might miss flash sales

FOLLOW-UP QUESTION: "How often should I check?
Every 6 hours is typical, but I can go as frequent as hourly."
Edge Case 3.5B: Timezone considerations
User is in GMT+8 (from system reminder)
Cron runs in UTC

If user says "check every morning":
  - "Morning" in GMT+8 = ~00:00-02:00 UTC
  - Must adjust cron accordingly

Current implementation: Fixed interval, timezone-agnostic
For time-of-day triggers: Must account for user timezone

PHASE 4: TRIGGER EXECUTION TRACE
When trigger fires (every 6 hours):
System State at Trigger Fire
SYSTEM MESSAGE INJECTED:
{
  type: "trigger_event",
  trigger_id: "schedule",
  trigger_instance_id: "tri_xxxxx",
  fired_at: "2026-02-16T00:00:00Z",
  payload: {}  // schedule triggers have no payload
}

CONTEXT STATE:
  - Previous conversation: NOT LOADED (clean context)
  - System prompt: LOADED
  - Active triggers: visible in state
  - DB state: accessible via tools
Execution Flow
STEP 1: Recognize trigger event
  - Parse system message
  - Identify: this is my price monitor trigger

STEP 2: Load monitor configuration
  SELECT * FROM price_monitors WHERE id = 1

  Returns:
  {
    url: "https://example.com/product",
    target_price: 500.00,
    last_price: 524.99,  // from previous run
    last_checked_at: "2026-02-15T18:00:00Z",
    notification_sent_at: NULL
  }

STEP 3: Run scraper subagent
  run_subagent(path, payload)

STEP 4: Process result
  subagent_result = {
    success: true,
    current_price: 489.99,  // DROPPED!
    previous_price: 524.99,
    price_changed: true
  }

STEP 5: Decision logic
  if (current_price < target_price AND notification_sent_at IS NULL):
    → SEND NOTIFICATION
    → UPDATE notification_sent_at
  elif (current_price < target_price AND notification_sent_at IS NOT NULL):
    → Already notified, skip (prevent spam)
  elif (current_price >= target_price):
    → Above threshold, just log
    → RESET notification_sent_at to NULL (re-arm for future drops)

STEP 6: Update database
  UPDATE price_monitors
  SET last_price = 489.99,
      last_checked_at = CURRENT_TIMESTAMP,
      notification_sent_at = CURRENT_TIMESTAMP
  WHERE id = 1

STEP 7: Send notification
  send_message({
    to: ["owner"],
    subject: "🔔 Price Alert: Product dropped to $489.99!",
    body: "The product you're monitoring has dropped below $500..."
  })

PHASE 5: EDGE CASES & FAILURE MODES
5.1 Scraping Failures
Edge Case: Site structure changes
SCENARIO:
  - Day 1: Price in <span class="price">$499</span>
  - Day 30: Site redesign, price now in <div data-cost="499">

DETECTION:
  - Subagent returns success=false, error="Could not extract price"
  - Or returns NULL price

HANDLING OPTIONS:
  A) Silent failure (bad - user never knows)
  B) Notify user after N consecutive failures
  C) Notify immediately on first failure

IMPLEMENTATION:
  - Add failure_count column to DB
  - Increment on each failure
  - Notify when failure_count >= 3
  - Reset on success

STATE TRACKING:
  failure_count: 0 → 1 → 2 → 3 → NOTIFY
Edge Case: Rate limiting
HTTP 429 received

HANDLING:
  - Don't count as "failure" (site is working)
  - Log the event
  - Consider: reduce check frequency
  - DO NOT retry immediately (makes it worse)

BACKOFF STRATEGY:
  - If rate limited, skip this check
  - Add rate_limited_at timestamp
  - If rate_limited twice in 24h, notify user to reduce frequency
Edge Case: Site goes down permanently
HTTP 404 or domain doesn't resolve for extended period

DETECTION:
  - Multiple consecutive failures
  - Different error type than parse failure

ACTION:
  - Notify user: "The product page appears to be unavailable"
  - DO NOT auto-delete trigger (user might want to keep monitoring)
  - Pause notifications after initial alert
5.2 State Corruption
Edge Case: Database query fails mid-execution
SCENARIO:
  - Price scraped successfully: $479
  - Notification sent
  - UPDATE query fails (disk full, timeout, etc.)

CONSEQUENCE:
  - notification_sent_at never updated
  - Next trigger run: price still below threshold
  - DUPLICATE NOTIFICATION SENT

MITIGATION:
  - Check notification_sent_at is within recent window, not just non-null
  - Add message deduplication (don't notify same price twice)
  - Wrap in transaction if possible (SQLite supports this)
Edge Case: Concurrent trigger execution
SCENARIO:
  - Trigger scheduled for 00:00 UTC
  - Previous execution still running at 00:00
  - Two instances running simultaneously

SQLITE BEHAVIOR:
  - SQLite handles concurrent reads
  - Writes are serialized (one waits for other)

POTENTIAL ISSUE:
  - Both read last_price = 524
  - Both scrape and get 489
  - Both try to notify
  - Both try to update

MITIGATION:
  - Add check before notification: re-query notification_sent_at
  - Use UPDATE ... WHERE notification_sent_at IS NULL
  - Atomic update prevents double-send
5.3 Context and Memory Issues
Edge Case: Context truncation during trigger handling
SCENARIO:
  - Trigger fires
  - I start processing
  - web_scrape_website returns large page (100KB)
  - Context approaches limit
  - System truncates older context

WHAT GETS TRUNCATED:
  - Previous tool call results (marked with <context-removed>)
  - NOT: system prompt, NOT: current execution state

IMPACT:
  - If I need to re-read scrape result, I must use read_file on blockId
  - Subagent mitigates this (scraping happens in isolated context)

WHY SUBAGENT HELPS:
  - Subagent context is separate
  - Only final result returns to main context
  - Large page content never enters main context
Edge Case: Subagent fails to return valid JSON
SUBAGENT OUTPUT:
  "I encountered an error while scraping. The page returned a 403."

  (Natural language instead of structured JSON)

HANDLING IN MAIN CONTEXT:
  - Attempt JSON.parse → fails
  - Fall back to text analysis
  - Extract error information from natural language
  - Log incident for debugging

PREVENTION:
  - Clear output format specification in subagent instructions
  - Example outputs in instructions
  - "ALWAYS return valid JSON, even for errors"
5.4 Notification Edge Cases
Edge Case: Email delivery failure
send_message returns error (rare, but possible)

HANDLING:
  - Log the failure
  - DO NOT mark notification_sent_at (so retry happens)
  - Consider: add email_failed_count, escalate after N failures
Edge Case: Price oscillates around threshold
TIMELINE:
  Check 1: $510 (above) - no notification
  Check 2: $495 (below) - NOTIFY, set notification_sent_at
  Check 3: $505 (above) - reset notification_sent_at
  Check 4: $492 (below) - NOTIFY again
  Check 5: $508 (above) - reset
  Check 6: $490 (below) - NOTIFY again

USER EXPERIENCE: Spammed with notifications

SOLUTIONS:
  A) Cooldown period: don't re-notify within 24 hours
  B) Hysteresis: only re-arm when price goes significantly above threshold
     (e.g., re-arm when price > target + 10%)
  C) User preference: ask during setup

IMPLEMENTATION:
  Add to schema: last_notification_price, cooldown_until
  Logic: if price < target AND (cooldown_until IS NULL OR now > cooldown_until)
Edge Case: User wants to stop monitoring
USER: "Stop monitoring that product"

REQUIRED ACTIONS:
  1. Delete trigger (manage_active_triggers, action: delete)
  2. Optionally: delete DB record
  3. Optionally: delete subagent file

CONSIDERATION:
  - User might want to resume later
  - Keep DB record with "active: false" flag?
  - Or clean delete everything?

BEST PRACTICE: Ask user
  "Should I delete the price history too, or keep it in case you want to resume monitoring later?"

PHASE 6: FAILURE RECOVERY PATTERNS
Pattern 1: Checkpoint State
For multi-step operations, checkpoint after each step:

STEP 1: Create DB schema → checkpoint: schema_created = true
STEP 2: Insert record → checkpoint: monitor_id = 1
STEP 3: Create subagent → checkpoint: subagent_path = "/agent/..."
STEP 4: Test scrape → checkpoint: initial_scrape_success = true
STEP 5: Setup trigger → checkpoint: trigger_id = "tri_xxx"

If failure at step 4:
  - Steps 1-3 already complete
  - Can retry from step 4
  - Don't recreate schema, don't re-insert record
Pattern 2: Idempotent Operations
All operations should be safe to retry:

CREATE TABLE IF NOT EXISTS  → idempotent
INSERT (without checking)   → NOT idempotent (creates duplicates)
INSERT with UNIQUE constraint → idempotent (fails gracefully)
UPDATE with WHERE clause    → idempotent
DELETE with WHERE clause    → idempotent
Pattern 3: Graceful Degradation
If non-critical component fails, continue with reduced functionality:

SCENARIO: Price history tracking fails, but current price extraction works

ACTION:
  - Log the history failure
  - Continue with core functionality (price alert)
  - Note in next user interaction: "Price history isn't being tracked due to [error]"

PHASE 7: OBSERVABILITY
What I Can Track
-- Price history for debugging/analysis
CREATE TABLE price_history (
  id INTEGER PRIMARY KEY,
  monitor_id INTEGER,
  price REAL,
  scraped_at TEXT,
  raw_snippet TEXT  -- Store excerpt for debugging parse issues
);

-- Execution log
CREATE TABLE execution_log (
  id INTEGER PRIMARY KEY,
  monitor_id INTEGER,
  executed_at TEXT,
  success BOOLEAN,
  error_message TEXT,
  duration_ms INTEGER
);
What I Cannot Track
- LLM reasoning steps (not persisted)
- Tool call intermediate states (ephemeral)
- Exact context at time of execution (not stored)
- Why I made a specific decision (no reasoning log)

IMPLICATION:
  - Debugging relies on explicit logging
  - Must log important decisions to DB or filesystem
  - Cannot "replay" past executions perfectly

Summary: Decision Tree
USER REQUEST
     │
     ▼
┌─────────────────┐
│ Parse & Validate │
│ - URL present?   │
│ - Threshold?     │
│ - Frequency?     │
└────────┬────────┘
         │
    [Missing info?]──Yes──► Ask user
         │
         No
         ▼
┌─────────────────┐
│ Architecture    │
│ - Subagent? Yes │
│ - Storage? SQL  │
│ - Trigger? Yes  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Setup           │
│ 1. Create schema│
│ 2. Insert record│
│ 3. Create subagt│
│ 4. Test scrape  │◄──[Fail]──► Report to user, halt
│ 5. Setup trigger│
└────────┬────────┘
         │
         ▼
    [Running]
         │
    ┌────┴────┐
    │ Trigger │
    │  Fires  │
    └────┬────┘
         │
         ▼
┌─────────────────┐
│ Execute         │
│ 1. Load config  │
│ 2. Run subagent │◄──[Fail]──► Increment failure count
│ 3. Compare price│              If count ≥ 3, notify user
│ 4. Update DB    │
│ 5. Notify?      │
└────────┬────────┘
         │
    [Price < Target?]
         │
    Yes──┴──No
     │      │
     ▼      ▼
  Notify   Log only
  user     continue

That's the complete technical trace. Want me to drill deeper into any specific phase, or trace through a different type of task (like multi-source data aggregation, or a webhook-triggered workflow)?
