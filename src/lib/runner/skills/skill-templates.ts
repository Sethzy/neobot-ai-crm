/**
 * Bundled skill content as string constants.
 *
 * Follows the same pattern as `src/lib/memory/templates.ts` — all content is
 * inlined in TypeScript so webpack bundles it into the server output. No
 * filesystem reads at runtime, works in Vitest, Next.js dev, and Vercel prod.
 *
 * @module lib/runner/skills/skill-templates
 */

// ---------------------------------------------------------------------------
// Default instruction skills (seeded to client storage on onboarding)
// ---------------------------------------------------------------------------

export const DEFAULT_SKILL_SLUGS = [
  "call-prep",
  "daily-briefing",
  "draft-outreach",
  "pipeline-review",
  "listing-analysis",
  "call-summary",
  "market-briefing",
] as const;

export type DefaultSkillSlug = (typeof DEFAULT_SKILL_SLUGS)[number];

export const DEFAULT_SKILL_CONTENT: Record<DefaultSkillSlug, string> = {
  "call-prep": `---
name: call-prep
description: Prepare for a client call or meeting with CRM history, property context, and focused talking points.
---

# Call Prep

Use this skill when the user asks for call prep, meeting prep, or a quick brief before speaking with a client, prospect, landlord, or buyer.

## Workflow

1. Use \`search_crm\` first to find the relevant contact, deal, recent interactions, open tasks, and any recorded preferences.
2. If a property, project, district, or market topic is involved, use \`web_search\` to gather recent context that could change the conversation.
3. Build a practical brief with:
   - who the person is and how they relate to the current deal or workflow
   - recent history, promises made, and open loops
   - property or market context that matters for this conversation
   - 3-5 talking points
   - likely objections, concerns, or decision blockers
   - the clearest next step to secure before the call ends
4. If the user wants the brief saved for later, use \`write_file\` with a descriptive filename.

## Gotchas

- Separate known facts from reasonable inference. Do not blur them together.
- Do not drown the user in CRM history. Surface only what changes the conversation.
- If search results are ambiguous, say so and keep the brief conditional.
- If market facts may be stale, say that explicitly rather than sounding certain.
`,

  "daily-briefing": `---
name: daily-briefing
description: Create a focused daily briefing with priority tasks, follow-ups, and deals that need attention today.
---

# Daily Briefing

Use this skill when the user asks for a morning briefing, start-of-day plan, or a quick overview of what matters today.

## Workflow

1. Use \`search_crm\` to pull today's tasks, overdue tasks, active deals, and recent interactions that still need follow-up.
2. If the user has standing preferences or planning habits that matter, use \`read_file\` on relevant memory files to personalize the briefing.
3. Turn the raw activity into a short operating plan:
   - what is urgent today
   - what is overdue and becoming risky
   - which deals are active but drifting
   - who needs a reply or a nudge
   - the top 3 actions that would move the day forward
4. Keep the output skimmable. Group by priority rather than by database entity.
5. If the user wants the plan stored or reused later, save it with \`write_file\`.

## Gotchas

- Do not produce a giant dump of every task in CRM.
- Highlight missing information when a deal or task is underspecified.
- Prefer action-oriented wording over a passive status report.
- If nothing looks urgent, say that clearly instead of manufacturing urgency.
`,

  "draft-outreach": `---
name: draft-outreach
description: Research a prospect or client and draft personalized outreach grounded in CRM context and public information.
---

# Draft Outreach

Use this skill when the user asks for help drafting a message to a lead, prospect, buyer, seller, landlord, or referral partner.

## Workflow

1. Start with \`search_crm\` to understand the relationship history, property context, prior promises, and tone of the relationship.
2. If the person, company, project, or market angle needs more context, use \`web_search\` to gather recent public information that can make the outreach more relevant.
3. Draft the message around one clear purpose:
   - re-engage a quiet lead
   - follow up after a viewing or conversation
   - share a relevant listing or market update
   - move the conversation to a concrete next step
4. Keep the draft natural, concise, and personalized. Mention only details you can support from CRM or public information.
5. If the user wants alternate versions, create a few tight variants rather than a long list.
6. If the user wants the draft saved, use \`write_file\`.

## Gotchas

- Do not invent rapport, urgency, or shared history.
- Do not make claims about listings, budgets, or timelines unless they are grounded in data.
- Avoid sounding like a mass blast. Specificity matters more than length.
- If public research is thin, lean on CRM context instead of guessing.
`,

  "pipeline-review": `---
name: pipeline-review
description: Review the deal pipeline, flag stale or risky deals, and recommend next actions for each important opportunity.
---

# Pipeline Review

Use this skill when the user asks for a pipeline review, deal review, or wants help spotting what in their pipeline needs attention.

## Workflow

1. Use \`search_crm\` to inspect active deals, recent interactions, linked contacts, and open tasks.
2. Identify the deals that matter most by urgency, value, inactivity, or missing next steps.
3. Summarize the pipeline in a practical way:
   - where momentum exists
   - which deals have gone quiet
   - which deals are blocked by missing information or delayed follow-up
   - which tasks should exist but do not
4. Recommend the next action for each important deal. Keep the advice concrete and executable.
5. If the user asks for a saved review or recurring checklist, use \`write_file\`.

## Gotchas

- Do not confuse a full pipeline inventory with a useful review. Focus on decisions and interventions.
- Call out data gaps clearly when a deal cannot be assessed confidently.
- Do not label something as stalled just because there was no interaction yesterday.
- If the pipeline looks healthy, say that. The review should not always sound alarmist.
`,

  "listing-analysis": `---
name: listing-analysis
description: Analyze a property listing with market context, pricing signals, and likely fit for people already in the CRM.
---

# Listing Analysis

Use this skill when the user asks whether a listing looks good, wants a fast property read, or needs help deciding which clients might match a listing.

## Workflow

1. Use \`web_search\` to gather the listing details, project context, nearby comparables, district signals, and any policy or supply context that materially affects the analysis.
2. Use \`search_crm\` to identify existing clients whose preferences, stage, and budget may fit the property.
3. Build a concise analysis that covers:
   - what the listing appears to be
   - what looks attractive
   - what looks risky or uncertain
   - how the pricing feels relative to nearby context
   - which CRM contacts might care and why
4. If the user wants a saved brief or reusable note, store it with \`write_file\`.

## Gotchas

- Separate listing facts from market interpretation.
- Be explicit when comparable evidence is thin or noisy.
- Do not oversell a listing just because the marketing copy is strong.
- If the address or project name is ambiguous, say so before making a confident judgment.
`,

  "call-summary": `---
name: call-summary
description: Turn call notes or a meeting recap into a clear summary with decisions, follow-ups, and what should happen next.
---

# Call Summary

Use this skill when the user shares notes from a call, asks for a recap, or wants help turning a conversation into a structured next-step summary.

## Workflow

1. Read the conversation notes carefully and identify the core facts before summarizing.
2. If the relevant contact or deal is unclear, use \`search_crm\` to anchor the summary to the right person or opportunity.
3. Produce a compact recap with:
   - what happened
   - what was decided
   - open questions or unresolved issues
   - specific follow-ups and owners where possible
   - what the user should do next
4. If the user wants the notes saved or turned into a reusable record, use \`write_file\` with a descriptive filename.

## Gotchas

- Do not invent commitments that were not actually made.
- Keep the summary tighter than the raw notes. Distillation is the job.
- If the notes are ambiguous, surface the ambiguity instead of pretending it is resolved.
- Distinguish between agreed actions and suggested next actions.
`,

  "market-briefing": `---
name: market-briefing
description: Create a concise market briefing with recent pricing signals, launches, policy changes, and implications for active work.
---

# Market Briefing

Use this skill when the user asks for a market update, district briefing, competitor snapshot, or wants help understanding what has changed recently.

## Workflow

1. Use \`web_search\` to gather recent and relevant market information. Focus on what is new or decision-changing: pricing shifts, launches, supply, policy updates, financing conditions, and notable local developments.
2. Use \`search_crm\` when helpful to connect the market update back to live deals, clients, or segments already in play.
3. Deliver the briefing in three layers:
   - what changed
   - why it matters
   - who or what in the current CRM pipeline is likely affected
4. Keep the summary crisp. Lead with the few changes that actually alter advice or timing.
5. If the user wants a saved briefing or reusable memo, use \`write_file\`.

## Gotchas

- Prioritize freshness. Old market commentary is rarely useful if newer signals exist.
- Do not present thin search evidence as a clear market trend.
- Separate observed facts from interpretation.
- If the update is mixed or noisy, say that plainly instead of forcing a strong narrative.
`,
};

// ---------------------------------------------------------------------------
// System skills (bundled in code, served via read_file fallback)
// ---------------------------------------------------------------------------

export const SYSTEM_SKILL_CONTENT: Record<string, string> = {
  "creating-connections/SKILL.md": `# Creating New Connections

You can create new connections to connect to new services. Creating a connection will save it to the user's account so they can use it in other agents in the future.

Use the \`create_new_connections\` tool to create connections. The tool accepts a \`type\` field to specify what kind of connection to create:

## Connection Types (in order of preference)

### 1. \`type: 'integrations'\` - Pre-built Integrations

The simplest option with easy authentication. Thousands available.

- Use \`search_for_integrations\` to find integrations relevant to the user's request.
- Use \`get_integrations_capabilities\` to understand integration capabilities before creating a connection.
- Consider all available info when recommending integrations, but avoid sharing quality scores or who built the integration with the user unless asked.
- If toolsToActivate are listed they will be activated automatically after the connection is created.

### 2. \`type: 'mcp'\` - Custom MCP Servers

Connects to custom MCP servers.

- For known services, check to see if there is a pre-built integration you can use.
- **Not yet available in v1.** Offer as a future option only.

### 3. \`type: 'direct_api'\` - Direct API Connections

Connects to APIs via HTTP endpoints.

- **You MUST read /agent/skills/system/creating-connections/create-direct-api-connection.md before creating a direct API connection.**
- Never hallucinate an endpoint or URL.
- **Not yet available in v1.** Offer as a future option only.

### 4. \`type: 'computer_use'\` - Computer Use

Provisions a remote computer for browser-based or desktop UI-based tasks. Slow and expensive.

- Tell the user about this option when helpful, but prefer other types when possible
- Allows you to view and use websites and user interfaces
- Use this if the user specifically asks to use a computer or browser
- **Not yet available in v1.** Offer as a future option only.

## Guidelines

If the user asks what integrations, apps, or services you can connect to, do not try to enumerate a complete list. Indicate that you can connect to almost any service via thousands of integrations, direct API access, custom MCP servers, or a virtual computer.

**Remember to:**

- Verify an integration has the capabilities needed to complete the task before creating a connection
- Offer Direct HTTP, Custom MCP, or Computer use as connection options when there are no available pre-built integrations that can satisfy the user's request`,

  "creating-connections/create-direct-api-connection.md": `# Creating Direct API Connections

## Overview

You can connect directly to HTTP APIs of external services. To create a connection, you must complete the following steps:

1. Research the API thoroughly
2. Verify the base URL and endpoint paths
3. Determine authentication requirements
4. Create test cases
5. Write notes for future use
6. Call the tool to present a secure credential form

### Step 1: Research the API

- Search for official API documentation
- Find example requests and curl commands (these show the correct paths)
- Identify ALL available endpoints - don't stop on the first couple
- Verify versioning requirements (e.g., /v1, /api/v2)
- If docs conflict on paths, do deeper research or ask the user
- Identify required user inputs (API keys, usernames, passwords, etc.)

### Step 2: Verify Base URL and Paths

- Base URL format: no trailing slash, no path segments (e.g., \`https://api.example.com\`)
- Be extremely careful to find the correct base URL - if unsure, ask the user
- For services with dynamic/custom base URLs, ask the user
- Verify endpoint paths include version prefixes (e.g., /v1/users) unless the base URL is already versioned
- Check both the base URL and individual endpoint paths for version prefixes

### Step 3: Determine Authentication

Identify which auth method the API uses and prepare the \`authConfig\` object. Common types:

- \`bearer\` for token auth (OpenAI, GitHub)
- \`header\` for API key auth (many services)
- \`basic\` for username/password
- \`query-parameter\` for auth via URL query parameters
- \`custom-oauth\` for OAuth2 with token refresh (use this instead of bearer when tokens expire)
- \`none\` for public APIs

Each auth field should include helpful labels, placeholders showing format, and descriptions of where users can find these values.

**Important**: Never ask users to enter credentials in conversation. The tool presents a secure UI form.

See **Auth Config Schema** below.

### Step 4: Create Test Cases

Create 1-3 test cases to verify the connection works. For REST APIs, provide a single GET test case.

Test cases must:

- Use GET method (you need a VERY good reason to use POST/PUT/PATCH/DELETE)
- Return quickly (< 5 seconds)
- Cost no money/credits
- Have no side effects
- Never purposefully fail

If GET is impossible, provide a detailed \`reasonIAmDoingThisDangerousThing\` (50+ chars) explaining:

- Why a modifying method is necessary to test THE AUTHENTICATION
- Why a GET test is not sufficient
- That you explicitly looked for NON-MODIFYING endpoints

See **Test Case Schema** below.

### Step 5: Write Notes

Write notes for future agents using this connection. Assume auth is configured and tested. Include:

- Links to official documentation
- Useful endpoints discovered
- API quirks or requirements
- Rate limits or usage considerations

Notes should be incredibly accurate. Do not start with a markdown heading - jump right into content.

### Step 6: Call the Tool

Use \`create_new_connection\` with \`type: 'direct_api'\`:

- Construct the \`authConfig\` object based on the Auth Config Schema below
- Construct the \`testCases\` array based on the Test Case Schema below
- Make the tool call

This tool presents the user with a custom UI form to securely enter their credentials and confirm the connection. Once the tool call succeeds, the user has provided valid credentials. These credentials are automatically added to subsequent HTTP requests, so you can immediately proceed to making HTTP calls without additional setup.

## Auth Config Schema

Each auth field supports UI hints (all optional, but try to set all when available):

- \`label\`: Human-readable field name
- \`placeholder\`: Example value format
- \`value\`: Pre-filled value (if known)
- \`description\`: What this field is and where to find it
- \`learnMore\`: \`{ title, markdown }\` for detailed help popup with step-by-step instructions on finding credentials in the service's UI

Example:

\`\`\`json
{
  "label": "API Key",
  "placeholder": "sk-...",
  "description": "Find this in your account dashboard",
  "learnMore": {
    "title": "How to get your API key",
    "markdown": "1. Go to [example.com/settings](https://example.com/settings)\\n2. Click 'API Keys'\\n3. Click 'Create new key'\\n4. Copy the key (it won't be shown again)"
  }
}
\`\`\`

### type: 'none'

No authentication required.

\`\`\`json
{ "type": "none" }
\`\`\`

### type: 'header'

Custom header authentication (API key in header).

\`\`\`json
{
  "type": "header",
  "headerName": { "label": "Header Name", "value": "X-API-Key" },
  "headerValue": { "label": "API Key", "placeholder": "sk-..." }
}
\`\`\`

### type: 'bearer'

Bearer token authentication (common for OpenAI, GitHub).

\`\`\`json
{
  "type": "bearer",
  "token": {
    "label": "API Token",
    "placeholder": "sk-...",
    "description": "Find this in your dashboard"
  }
}
\`\`\`

### type: 'basic'

HTTP Basic authentication.

\`\`\`json
{
  "type": "basic",
  "username": { "label": "Username", "placeholder": "user@example.com" },
  "password": { "label": "Password", "placeholder": "..." }
}
\`\`\`

### type: 'query-parameter'

Authentication via URL query parameters.

\`\`\`json
{
  "type": "query-parameter",
  "queryParameters": [
    { "name": { "value": "api_key" }, "value": { "label": "API Key", "placeholder": "..." } }
  ]
}
\`\`\`

### type: 'custom-oauth'

OAuth2 authentication. Scopes and additionalParams fields are optional. Use space-separated values for scopes.

\`\`\`json
{
  "type": "custom-oauth",
  "clientId": { "label": "Client ID", "placeholder": "..." },
  "clientSecret": { "label": "Client Secret", "placeholder": "..." },
  "authUrl": { "value": "https://..." },
  "tokenUrl": { "value": "https://..." },
  "scopes": {
    "label": "Scopes",
    "value": "read write",
    "description": "Space-separated list"
  },
  "additionalParams": {
    "label": "Additional OAuth Parameters",
    "placeholder": "access_type=offline",
    "description": "Extra parameters for the auth URL in query string format"
  }
}
\`\`\`

## Test Case Schema

\`\`\`json
{
  "id": "unique-id",
  "name": "Test connection",
  "method": "GET",
  "path": "/v1/endpoint",
  "verificationStatement": "I verified this endpoint exists in the official docs and is read-only. I explored the entire API documentation and found all endpoints, choosing this as the fastest way to verify authentication."
}
\`\`\`

Fields:

- \`id\`: Unique identifier string
- \`name\`: Human-readable test name
- \`method\`: Either \`"GET"\` or \`{ "method": "POST"|"PUT"|"PATCH"|"DELETE", "reasonIAmDoingThisDangerousThing": "..." }\`
- \`path\`: Endpoint path - be extremely careful to get this right, include version prefix (e.g., /v1/users) unless base URL is already versioned
- \`verificationStatement\`: **Displayed to user**. Explain what you verified and why this test is appropriate. Must state that you explored the entire API documentation and found all endpoints.
- \`description\`: Optional description
- \`requestBody\`: Optional raw request body string
- \`extraHeaders\`: Optional additional headers object (cannot include blocked headers; Content-Type is added automatically)`,
};

// ---------------------------------------------------------------------------
// Default skill helpers
// ---------------------------------------------------------------------------

/** Whether a slug is one of the bundled defaults (and therefore resettable). */
export function isDefaultSkillSlug(slug: string): boolean {
  return (DEFAULT_SKILL_SLUGS as readonly string[]).includes(slug);
}

/** Returns the bundled default content for a slug, or null if not a default. */
export function getDefaultSkillContent(slug: string): string | null {
  if (!isDefaultSkillSlug(slug)) return null;
  return DEFAULT_SKILL_CONTENT[slug as DefaultSkillSlug];
}
