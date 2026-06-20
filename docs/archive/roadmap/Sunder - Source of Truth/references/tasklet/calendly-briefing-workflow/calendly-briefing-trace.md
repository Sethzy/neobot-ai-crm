# How Tasklet Actually Executes: Calendly Briefing Trace

## The Setup

User types into chat:

> "When I get a new Calendly booking via webhook, research the attendee's company and post a briefing to Slack."

That's the entire input. Everything below happens from this single sentence.

---

## PHASE 1: THE SETUP CONVERSATION (Interactive Chat)

This is a normal chat session. The user is present. I'm an LLM with tools. My job is to understand what they want, get the prerequisites in place, and wire it all up.

### Step 1: I parse the intent

I'm just an LLM reading a sentence. I identify four things I need:

1. A **Calendly webhook trigger** — something that fires when a booking happens
2. **Research capability** — web search tools to look up the attendee's company
3. A **Slack connection** — authenticated access to post messages
4. A **workflow definition** — instructions for what to do when the trigger fires

### Step 2: I check what connections exist

I call `list_users_connections()`.

This is a tool call. The platform executes it and returns a list. Let's say it returns:

```
connections: [
  { connectionId: "conn_abc", serviceName: "Slack", accountName: "seth-workspace" }
]
```

Good — Slack exists. No Calendly connection yet.

### Step 3: I figure out what tools I need from Slack

I call `get_details_for_connections(connectionIds: ["conn_abc"], includeToolDetails: true)`.

Platform returns the full tool catalog for that Slack connection:

```
tools: [
  { name: "send_message_to_channel", status: "deactivated", description: "..." },
  { name: "list_channels", status: "deactivated", description: "..." },
  { name: "send_direct_message", status: "deactivated", description: "..." },
  ...
]
```

None are activated yet. I need `send_message_to_channel` at minimum.

### Step 4: I activate the Slack tools

I call `manage_activated_tools_for_connections`:

```
connections: [{
  connectionId: "conn_abc",
  activate: ["send_message_to_channel", "list_channels"],
  deactivate: []
}]
```

**This shows a UI card to the user.** The user sees: "Tasklet wants to activate these Slack tools. Approve?" The user clicks approve. The tool call returns with `userAction: "approved"`.

Now `conn_abc__send_message_to_channel` exists in my tool surface. I can call it.

### Step 5: I search for the right trigger

I call `search_triggers(keywords: ["calendly", "webhook"])`.

Platform returns available trigger types:

```
[
  {
    trigger_id: "webhook",
    name: "Webhook",
    description: "Fires when an HTTP POST is received at a unique URL",
    setupSchema: { ... }
  },
  {
    trigger_id: "calendly",
    name: "Calendly",
    description: "Fires on Calendly events (booking created, canceled, etc.)",
    setupSchema: {
      required: ["event_type"],
      properties: {
        event_type: { enum: ["invitee.created", "invitee.canceled"] }
      }
    },
    prerequisites: ["Calendly connection required"]
  }
]
```

There's a specific Calendly trigger. But it needs a Calendly connection. The user doesn't have one.

### Step 6: I ask the user

I say something like: "I found a Calendly-specific trigger, but I'll need to connect to your Calendly account first. Want to set that up?"

User says: "yeah go ahead"

### Step 7: I create the Calendly connection

First I read the skill file for creating connections (required by my instructions):

```
read_file("/agent/skills/system/creating-connections/SKILL.md")
```

Then I search for the integration:

```
search_for_integrations(keywords: ["calendly"])
```

Returns integration ID. Then:

```
create_new_connections({
  connection: {
    type: "integrations",
    integrations: [{ integrationId: "calendly" }]
  }
})
```

**Another UI card.** User sees an OAuth flow for Calendly. They click authorize, log in to Calendly, grant permissions. Tool returns with `connectionId: "conn_def"`, `userAction: "created"`.

### Step 8: I ask which Slack channel

"Which Slack channel should I post briefings to?"

User says: "#sales-intel"

### Step 9: I build the subagent instruction file

This is the key moment. I need to define **what happens when the trigger fires**. Remember: when a trigger fires, a FRESH LLM instance wakes up with NO memory of this conversation. It needs to know what to do.

So I write an instruction file:

```
write_file(
  path: "/agent/subagents/calendly-briefing.md",
  content: <the instructions below>
)
```

The content is something like:

```markdown
# Calendly Booking Briefing

## Purpose
When a Calendly booking event arrives, research the attendee and their company,
then post a structured briefing to Slack.

## Instructions

1. Extract the attendee's name and email from the trigger payload
2. Extract the company domain from the email (everything after @)
3. Research the company:
   - Search the web for the company name + domain
   - Look for: what they do, size, funding, recent news
4. Research the person:
   - Search for their name + company
   - Look for: role, LinkedIn profile, any recent public activity
5. Format a briefing with:
   - Meeting: date/time, event type
   - Person: name, role, email
   - Company: summary, size, funding, recent news
   - Talking points: 2-3 suggested conversation starters based on research
6. Post to Slack channel #sales-intel using the Slack connection (conn_abc)
   - Use conn_abc__send_message_to_channel
   - Format as a rich Slack message
7. If research yields very little, still post what you found.
   Never skip the Slack post.
```

**This file is just text.** It's a prompt. It lives at `/agent/subagents/calendly-briefing.md` on my persistent FUSE-mounted storage.

### Step 10: I create the trigger

```
setup_trigger(
  trigger_id: "calendly",
  params: {
    event_type: "invitee.created",
    connection_id: "conn_def"
  }
)
```

Platform registers a webhook with Calendly's API. Whenever a new booking happens, Calendly will POST to a Tasklet-managed URL. The platform maps that to my agent.

### Step 11: I confirm to the user

"All set! When someone books a Calendly meeting with you, I'll research their company and post a briefing to #sales-intel. Want me to run a test?"

---

**Setup is done.** I used 10+ tool calls across the conversation. The user approved two permission prompts (Slack tools, Calendly OAuth). The artifacts left behind are:

- `/agent/subagents/calendly-briefing.md` (instruction file on FUSE storage)
- Trigger registered in the platform
- Slack connection with activated tools
- Calendly connection

The chat session ends. **My LLM context is gone.** The conversation is stored by the platform but I don't carry it forward. I'm "asleep."

---

## PHASE 2: THREE DAYS LATER — THE TRIGGER FIRES

Someone books a meeting via Calendly. Here's what happens.

### Step 1: The platform receives the webhook

Calendly POSTs to the Tasklet-managed webhook URL. The platform matches it to my agent and the registered trigger.

### Step 2: The platform spins up a FRESH LLM instance

This is the critical thing to understand. **This is not the same LLM instance from the setup conversation.** It's a completely new invocation. It has:

- **My system prompt** — the same giant prompt you've seen (all my tool definitions, personality, instructions)
- **A system message with the trigger event** — containing the Calendly payload
- **My synced state** — active triggers, tasks, connections with their activated tools
- **NO conversation history** — it doesn't know about the setup chat

The trigger event payload looks something like:

```json
{
  "trigger": "calendly",
  "event": "invitee.created",
  "data": {
    "event_type": "30-Minute Meeting",
    "start_time": "2026-02-26T10:00:00Z",
    "invitee": {
      "name": "Jane Chen",
      "email": "jane.chen@acmecorp.io"
    },
    "event_url": "https://calendly.com/seth/30min/abc123"
  }
}
```

### Step 3: The LLM reads the trigger payload and decides what to do

Here's where the "magic" is, and also where people get confused.

**I'm just an LLM reading a system message.** I see:
- My system prompt tells me I have triggers and subagents
- A trigger event just fired with Calendly booking data
- I have skill files available on my filesystem

My system prompt includes instructions about how triggers work:

> "When an event fires you will be invoked with a system message containing the details of the event. You will then be responsible for handling the event."

So I know I need to handle this. But I don't have instructions for *how* — those are in the subagent file I wrote 3 days ago.

### Step 4: I check what I have

**This is the "rediscovery" step.** The fresh LLM instance needs to figure out what workflow to run.

I call `read_file(path: "/agent/subagents/")` to see what subagent instruction files exist:

```
/agent/subagents/
└── calendly-briefing.md
```

The filename + the trigger type make it obvious. I read the file:

```
read_file(path: "/agent/subagents/calendly-briefing.md")
```

Now I have the full instructions I wrote during setup. I know exactly what to do.

### Step 5: I call run_subagent

```
run_subagent(
  path: "/agent/subagents/calendly-briefing.md",
  payload: '{"event_type": "30-Minute Meeting", "start_time": "2026-02-26T10:00:00Z", "invitee": {"name": "Jane Chen", "email": "jane.chen@acmecorp.io"}}'
)
```

### Step 6: The platform spawns ANOTHER fresh LLM instance (the subagent)

Now there are conceptually two LLM "instances":

```
┌────────────────────────────────┐
│  PARENT (trigger handler)      │
│  - Received trigger event      │
│  - Read subagent instructions  │   WAITING for subagent to finish
│  - Called run_subagent          │   (blocked on tool call)
│  - Holding the trigger context │
└────────────────────────────────┘
          │
          │ run_subagent
          ▼
┌────────────────────────────────┐
│  SUBAGENT (calendly-briefing)  │
│  System prompt: same as parent │
│  + instructions from .md file  │
│  + payload as first user msg   │
└────────────────────────────────┘
```

The subagent receives:
* `{"event_type": "30-Minute Meeting", "start_time": "2026-02-26T10:00:00Z", "invitee": {"name": "Jane Chen", "email": "jane.chen@acmecorp.io"}}`

The subagent is now a fully autonomous LLM with tool access. It starts executing.

### Step 7: The subagent executes the research workflow

The subagent reads the instructions and payload. It now makes a series of tool calls:

**Tool call 1:** `web_search_web(query: "acmecorp.io company")`

The platform executes the search. Results come back:
> "AcmeCorp — Enterprise logistics platform, Series B, 200 employees..."

**Tool call 2:** `web_scrape_website(url: "https://acmecorp.io/about")`

Platform fetches the page, returns markdown content.

**Tool call 3:** `web_search_web(query: "Jane Chen AcmeCorp")`

Results come back:
> "Jane Chen, VP of Operations at AcmeCorp..."

**Tool call 4:** `web_search_web(query: "AcmeCorp funding news 2025 2026")`

Results come back with recent news.

Each of these tool calls follows the same pattern:
1. The LLM generates a tool call (text output in a specific format)
2. The platform intercepts it, executes the tool
3. The result is appended to the conversation
4. The LLM generates the next step

**This is the "tool loop."** It's not code. It's not a for-loop. It's the LLM generating one tool call at a time, getting results, and deciding what to do next. The platform orchestrates this loop — it keeps feeding results back to the LLM until the LLM produces a final text response instead of a tool call.

### Step 8: The subagent posts to Slack

After gathering research, the subagent composes the briefing and calls:

**Tool call 5:** `conn_abc__send_message_to_channel(channel: "#sales-intel", text: "...")`

The message content:

```
📅 *New Calendly Booking — Briefing*

*Meeting:* 30-Minute Meeting — Feb 26, 2026 at 10:00 AM UTC
*Calendly link:* https://calendly.com/seth/30min/abc123

*Attendee:* Jane Chen
*Email:* jane.chen@acmecorp.io
*Role:* VP of Operations

*Company: AcmeCorp*
Enterprise logistics platform. Series B ($45M, led by a16z, 2025).
~200 employees. HQ in San Francisco.
Recent: Launched AI-powered route optimization feature (Jan 2026).
Named in Forbes Cloud 100 Rising Stars.

*Talking Points:*
1. Their new AI route optimization — how's adoption going?
2. Series B was recent — are they scaling the ops team?
3. Logistics + AI is hot — what pain points drove the investment?
```

The platform routes this through the Slack connection. The API call goes to Slack. Message appears in #sales-intel.

### Step 9: The subagent produces its final message

The subagent's last output is a text response (not a tool call):

> "Posted briefing for Jane Chen (AcmeCorp) to #sales-intel. Company is a Series B logistics platform, she's VP of Operations."

**This text is the ONLY thing that goes back to the parent.** All five tool calls, all the search results, all the intermediate reasoning — discarded. The parent only sees this final string.

### Step 10: The parent receives the result

Back in the parent (trigger handler) context, the `run_subagent` tool call returns:

```
result: "Posted briefing for Jane Chen (AcmeCorp) to #sales-intel. Company is a Series B logistics platform, she's VP of Operations."
```

The parent has nothing more to do. It produces its final output (which nobody sees — there's no user in the chat for a trigger run). The LLM instance is discarded. Done.

---

## THE ACTUAL STATE DIAGRAM

Here's every piece of state and where it lives during execution:

```
DURABLE STATE (survives across all runs):
├── /agent/subagents/calendly-briefing.md  ← FUSE storage (cloud-backed)
├── /agent/home/*                          ← FUSE storage (cloud-backed)
├── SQL database                           ← Platform-managed
├── Trigger registration                   ← Platform-managed
├── Slack connection (conn_abc)            ← Platform-managed
└── Calendly connection (conn_def)         ← Platform-managed

EPHEMERAL STATE (exists only during this run):
├── Parent LLM context                    ← Gone when run ends
├── Subagent LLM context                  ← Gone when subagent returns
└── /tmp/*                                ← Gone when run ends

EXTERNAL STATE (created as side effects):
└── Slack message in #sales-intel          ← Lives in Slack forever
```

---

## WHY SUBAGENTS EXIST (The Context Window Problem)

You might ask: why not just do all the research in the parent? Why spawn a subagent?

**Context window management.** Every tool call result gets appended to the LLM's conversation. Five web searches with full page content could easily be 50,000+ tokens. If the parent did this directly:

1. The parent's context fills up with research data
2. If there are MORE triggers to handle, or the parent needs to do other work, it's now bloated
3. Token costs scale with context size — every subsequent tool call pays for all previous context

By spawning a subagent:
1. All the research bloat is contained in the subagent's context
2. The subagent's context is discarded after it returns
3. The parent gets back a single clean string — context stays lean

It's the same reason you'd use a function in code instead of inlining everything — encapsulation, not for reuse, but for **isolation**.

---

## WHAT COULD GO WRONG (And How It's Handled)

### The Slack connection expires
The subagent tries to call `conn_abc__send_message_to_channel` and gets an auth error. Per my instructions, I:
1. Send an email to the user: "Your Slack connection needs reauthorization. The Calendly briefing workflow can't post until you fix this."
2. Create a task: "Retry Calendly briefing for Jane Chen after Slack reauth"
3. Do NOT delete the trigger — it should keep firing, and will work once the user fixes Slack

### The research turns up nothing
The instructions say "If research yields very little, still post what you found." So the subagent posts a minimal briefing with just name + email + domain. Something is better than nothing.

### The subagent hits an error mid-research
The subagent's error gets returned as its final message. The parent sees something like "Error: web search timed out during company research." The parent can then decide to retry, post a partial result, or notify the user.

---

## THE KEY INSIGHT FOR YOUR ARCHITECTURE

The entire system is just **LLM calls with tools, orchestrated in a loop.**

There's no workflow engine. No DAG. No state machine. No step definitions. The "workflow" is a natural language instruction file that an LLM interprets at runtime. The "orchestration" is the LLM deciding which tool to call next based on results so far.

This is both the power and the risk:
- **Power:** The workflow adapts. If AcmeCorp's website is down, the LLM tries a different search. If the email domain is a personal Gmail, the LLM skips company research and focuses on the person. No DAG can do that without explicit branching logic for every case.
- **Risk:** The workflow is non-deterministic. The same trigger payload might produce slightly different briefings each time. The LLM might occasionally hallucinate or make a weird research decision.

For your architecture with `streamText({ maxSteps: 20 })` — it's the same loop. The Vercel AI SDK keeps calling the model, executing tools, feeding results back, until the model produces a text response or hits 20 steps. That IS the orchestration engine. The instruction file IS the workflow definition. There's nothing else.
