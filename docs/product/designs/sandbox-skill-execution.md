# Sandbox Skill Execution — Design Doc

**Status:** Draft v2 — revised architecture (Sprites + persistent sessions)
**Date:** 2026-03-23 (original: 2026-03-19)
**Scope:** Add code execution capability to Sunder via Sprites (Fly.io) + Claude Code CLI

---

## 1. Problem

Sunder's agent has structured tools (CRM, memory, triggers, connections) but cannot:

- Analyze uploaded spreadsheets and produce Excel financial models
- Generate and publish interactive web deliverables (property showcases, pitch pages)

The user (a real estate agent) is the domain expert. We cannot pre-build deterministic scripts for every analysis they'll want. The agent needs to **write and run code** guided by the user's own instructions.

### Two Dedicated Tools, One Sprite

| | `analyze_spreadsheet` | `publish_artifact` |
|---|---|---|
| **Use case** | RE financial projections, deal comparison, data analysis | Property showcases, pitch pages, neighborhood guides |
| **Input** | Uploaded xlsx/csv + analysis request | Property name (agent gathers data first via CRM/search/browser) |
| **Output** | `.xlsx` file → download link in chat | Live preview URL → shareable link |
| **Baked-in skill** | Anthropic xlsx skill (formulas, recalc, LibreOffice) | Pre-scaffolded React property page template |
| **User skill** | `/agent/skills/re-analyst/SKILL.md` (analysis prefs) | `/agent/skills/frontend-design/SKILL.md` (brand prefs) |
| **Runtime** | Python 3 + pandas + openpyxl + LibreOffice | Node 22 + Vite + React + Tailwind |
| **Iteration** | Multi-turn (same Sprite, auto-sleeps between turns) | Multi-turn (same Sprite, live preview updates) |

Both tools use the **same default Sprite** (Ubuntu (current LTS) with Python, Node, Claude Code all pre-installed). Dependencies like `pandas`, `openpyxl`, and LibreOffice are installed on first use and persist across hibernation. No custom Sprite templates needed.

## 2. Core Insight

### Why Not Vercel Sandbox?

The v1 design used Vercel Sandbox (ephemeral Firecracker microVMs) with on-demand snapshots. This works for single-shot code execution, but falls apart for the iterative workflow users actually need:

1. **Users iterate.** "Analyze this" → "now break it down by region" → "add a trendline" → "export as PDF." Each iteration would mean booting a new sandbox, re-uploading data, re-installing dependencies, and losing all context.
2. **The outer agent isn't a coding agent.** Sunder's runner (Gemini Flash, Vercel AI SDK) is great at business orchestration. It doesn't know how to debug pandas errors or fix React build failures. Trying to make it handle code iteration (parse errors, generate fixes, retry) adds massive complexity.
3. **Ready-made coding agents exist.** Claude Code is a complete, autonomous coding agent. Instead of building custom orchestration, we delegate the entire coding task and let Claude Code handle iteration, error recovery, and file management inside the sandbox.

### The Pattern: Delegate to a Coding Agent Inside a Persistent Sandbox

From studying [OpenComputer/Digger](https://opencomputer.dev/guides/building-open-lovable-part-1), [Vercel coding-agent-template](https://github.com/vercel-labs/coding-agent-template), and [Harrison Chase's two-pattern taxonomy](https://blog.langchain.com/the-two-patterns-by-which-agents-connect-sandboxes/):

- **Sunder's runner is the planner and data gatherer.** It uses lightweight tools (CRM, web search, browser, Apify) to assemble context and data. No sandbox needed for this.
- **Claude Code is the coding agent.** It runs inside a persistent Sprite, reads skill files, writes code, runs it, iterates on errors, and returns results. The runner hands off a task and gets back a result.
- **The user steers via skill files.** Per-client SKILL.md files in Supabase Storage — same pattern as SOUL.md, USER.md, MEMORY.md.
- **The Sprite auto-sleeps between turns.** No idle compute cost. Wakes in <1 second when the user asks for the next iteration.

### Why Sprites (Fly.io)?

| Criteria | Vercel Sandbox | Sprites (Fly.io) | OpenComputer (Digger) |
|---|---|---|---|
| **Persistence** | Ephemeral (dies on timeout) | Auto-sleep/wake, S3-backed storage | Hibernate/wake |
| **Claude Code** | Install at boot (~15-30s) | Pre-installed | Agent SDK baked in |
| **Preview URLs** | Wire up yourself | Port 8080 (private by default, must set auth to public) | Built-in + auth |
| **Multi-turn** | Shell out to CLI each time, new session | Same Sprite, same filesystem, <1s wake | `session.sendMessage()` |
| **Idle cost** | Burning compute until timeout | No idle compute (storage: $0.000027/GB-hr) | Nothing (hibernating) |
| **Checkpoints** | Manual snapshots | ~300ms transactional, copy-on-write | Hibernate (auto) |
| **Backing** | Vercel (massive) | Fly.io (established, well-funded) | Digger (small startup) |
| **Pricing** | $0.128/vCPU-hr active CPU | $0.07/CPU-hr + $0.04375/GB-hr | Unknown |
| **DX** | `@vercel/sandbox` SDK, shell out to CLI | REST API + JS/Go SDK, shell out to CLI | `sandbox.agent.start()`, structured events |

**Decision: Sprites.** Fly.io is established and battle-tested (running Firecracker at scale for years). Claude Code pre-installed. Auto-sleep/wake solves multi-turn with no idle compute cost while sleeping (storage still bills at $0.000027/GB-hr). Preview URLs work out of the box. $30 free credits to prototype.

OpenComputer has nicer DX (`sandbox.agent.start()` with structured event streaming), but it's a small startup. Sprites gives us the same persistence model with Fly.io reliability. We can always swap providers later — the pattern is the same.

## 3. Architecture

```
Sunder Runner (Gemini Flash, Vercel AI SDK)
│
├── Structured tools (no sandbox)
│   CRM, memory, triggers, Composio, approvals, web tools
│   → run directly on Vercel Functions
│
├── analyze_spreadsheet tool
│   │
│   │  1. Downloads user's files + skill files from Supabase Storage
│   │  2. Creates (client.createSprite(name)) or references existing (client.sprite(name)) Sprite
│   │  3. Writes files into Sprite filesystem
│   │  4. Runs: sprite.execFile('claude', [...args], { env })
│   │  5. Reads output files from Sprite
│   │  6. Uploads results to Supabase Storage
│   │  7. Sprite auto-sleeps (stays alive for follow-ups)
│   │
│   ▼
│   Sprite (Fly.io) — per-client, reusable
│   ├── Claude Code CLI (pre-installed)
│   ├── Python 3 + pandas + openpyxl + LibreOffice
│   ├── Anthropic xlsx skill (written on first use)
│   ├── User's re-analyst SKILL.md (loaded at runtime)
│   └── User's uploaded files (loaded at runtime)
│
└── publish_artifact tool
    │
    │  1. Runner gathers data FIRST (CRM, search, browser — no sandbox)
    │  2. Creates (client.createSprite(name)) or references existing (client.sprite(name)) Sprite
    │  3. Writes property data + photos + skill files into Sprite
    │  4. Runs: sprite.execFile('claude', [...args], { env })
    │  5. Dev server via sprite.createService() → preview URL (set auth to public)
    │  6. Returns preview URL to user
    │  7. Sprite auto-sleeps (stays alive for follow-ups)
    │
    ▼
    Sprite (Fly.io) — per-client, reusable
    ├── Claude Code CLI (pre-installed)
    ├── Node 22 + Vite + React + Tailwind
    ├── Pre-scaffolded property page template (written on first use)
    ├── User's frontend-design SKILL.md (loaded at runtime)
    └── Property data + photos (assembled by runner, loaded at runtime)
```

### What Stays on the Platform (No Sandbox)

| Tool Category | Examples | Why no sandbox |
|---|---|---|
| CRM tools | createDeal, updateContact, searchRecords | Structured DB operations |
| Memory tools | read_file, write_file (SOUL/USER/MEMORY) | Supabase Storage I/O |
| Connection tools | Gmail, WhatsApp, calendar via Composio | OAuth API calls |
| Trigger tools | setup/manage autopilot triggers | DB operations |
| Web tools | search, fetch, scrape | Platform-level HTTP |
| Utility tools | calculate, ask_user, send_message | Lightweight platform ops |

## 4. Multi-Turn Iteration — The Key Change

### Why This Matters

The v1 design treated each tool call as a one-shot: boot sandbox → run → destroy. Users don't work that way. They iterate:

**Analysis iteration:**
```
"Analyze this spreadsheet of Q1 listings"
  → runs pandas, produces Excel model
"Now break it down by district"
  → needs the same data + previous analysis context
"Remove the outliers and add a trendline"
  → iterating on the same work
"Export that as a PDF"
  → still the same session
```

**Artifact iteration:**
```
"Build me a showcase page for the 42 Noriega listing"
  → Claude Code builds React app, preview URL live
"Swap the hero to photo 3 and add a mortgage calculator"
  → modifies existing code, preview updates
"Make the cards bigger with more whitespace"
  → another tweak, same session
"Looks good, ship it"
  → final version published
```

### How It Works with Sprites

```
Iteration 1: "Analyze this spreadsheet"
  → Runner creates a Sprite for this thread (client.createSprite()) or references existing one (client.sprite())
  → Writes uploaded files + skill files into Sprite
  → sprite.execFile('claude', ['--dangerously-skip-permissions', '-p', '...'], { env })
  → Claude Code writes Python, runs pandas, produces Excel
  → Runner reads output, uploads to Supabase Storage, returns download link
  → Sprite auto-sleeps (no idle compute cost while user reviews the model)

Iteration 2: "Now break it down by district" (3 minutes later)
  → Sprite wakes in <1 second
  → All files from iteration 1 still there (persistent filesystem)
  → sprite.execFile('claude', ['-p', 'Break down the analysis by district'], { env })
  → Claude Code reads existing code + data, modifies analysis
  → Runner reads updated output, returns new download link

Iteration 3: "Add a trendline" (10 minutes later)
  → Same pattern. Sprite wakes, files intact, Claude Code modifies.

Iteration 4: "Export as PDF" (next day — Sprite was sleeping all night, no idle compute cost)
  → Same pattern. Sprite wakes, everything still there.
  → Runner marks session complete, optionally kills the Sprite
```

### Sprite Lifecycle

**One Sprite per thread** (not per client, not per tool call). This matches the existing concurrency model — one run per thread via `thread_queue_records`.

```
Thread starts
  │
  ▼
First sandbox tool call → client.createSprite(name) for this thread
  │
  ▼
  ┌─────────────────────────────────┐
  │       Per-Thread Sprite          │
  │                                  │
  │  RUNNING  ──auto──►  SLEEPING   │
  │     ▲                    │      │
  │     │    wake (<1s)      │      │
  │     └────────────────────┘      │
  └─────────────────────────────────┘
  │
  ▼
Kill after:
  - 24h of no activity, OR
  - User explicitly finishes ("ship it"), OR
  - Thread is archived/closed
```

**Why per-thread, not per-client:**
- **No concurrency collisions.** Two threads can't fight over the same Sprite — each thread has its own, serialized by the existing queue.
- **No dep conflicts.** A deal-comparison thread gets Python+pandas. A showcase thread gets Node+React. They don't coexist in one bloated VM.
- **Clean lifecycle.** Thread goes quiet → Sprite sleeps → 24h inactivity → destroyed. Natural, no manual cleanup.
- **Cost is fine.** No idle compute cost while sleeping (storage still bills at $0.000027/GB-hr). A user with 3 active threads has 3 sleeping Sprites — negligible cost.

**Why not per-tool-call (ephemeral):**
- Users iterate 3-4 times per task. Re-creating the Sprite and re-uploading files each time wastes time and loses the filesystem context from previous iterations.

**Other rules:**
- **Auto-sleep** when idle — no idle compute cost between iterations (storage still bills at $0.000027/GB-hr).
- **Wake in <1 second** — feels instant to the user.
- **Checkpoint before risky operations** — ~300ms, transactional, can rollback.
- **Max Sprites per client:** 3 concurrent (soft limit, prevents runaway cost from abandoned threads).

### Sprite Session Tracking

The Sprite name is stored per thread so follow-up messages route to the same Sprite:

```typescript
// In thread metadata or a sprite_sessions table
{
  threadId: "thread_abc",
  clientId: "client_123",
  spriteName: "thread-thread_a", // Fly.io Sprite name (SDK is name-addressed)
  createdAt: "2026-03-23T10:00:00Z",
  lastActiveAt: "2026-03-23T10:15:00Z",
  status: "sleeping",          // running | sleeping | destroyed
}
```

## 5. Skill Files — The User's Steering Wheel

### Storage Location

Same bucket and pattern as memory files:

```
Supabase Storage: agent-files bucket
{clientId}/
├── SOUL.md                          ← existing
├── USER.md                          ← existing
├── MEMORY.md                        ← existing
├── memory/                          ← existing
│   ├── preferences.md
│   ├── patterns.md
│   └── key-decisions.md
└── skills/                          ← NEW
    ├── re-analyst/                  ← user-created/edited (for analyze_spreadsheet)
    │   ├── SKILL.md
    │   └── references/
    │       ├── sg-property-taxes.md
    │       ├── my-benchmarks.md
    │       └── client-profiles.md
    └── frontend-design/             ← user-created/edited (for publish_artifact)
        └── SKILL.md                 ← brand colors, typography, layout prefs
```

Uses existing `toStoragePath()` / `toModelPath()` from `src/lib/storage/agent-paths.ts`.

### How Skills Are Created and Edited

The user teaches the agent their preferences through normal conversation:

```
User: "Set up my property analysis preferences. I always check
       net yield — must beat 2.5%. My mortgage is 3.8% fixed.
       I focus on D9-D11 freehold. Compare to REITs at 5%."

Agent: writes /agent/skills/re-analyst/SKILL.md via existing write_file tool

User: "For my showcase pages, I want dark backgrounds, gold accents,
       luxury feel. Always include neighborhood map and my contact card."

Agent: writes /agent/skills/frontend-design/SKILL.md via existing write_file tool
```

No sandbox involved — skill file creation uses the existing platform `write_file` tool.

## 6. Tool 1: `analyze_spreadsheet`

### Tool Definition

```typescript
analyze_spreadsheet: tool({
  description: "Analyze spreadsheet data and produce an Excel financial model. "
    + "Use when the user uploads an xlsx/csv file or asks for financial analysis, "
    + "deal comparison, ROI calculation, or any spreadsheet-based analysis. "
    + "Output is a downloadable .xlsx file with proper Excel formulas. "
    + "Supports multi-turn iteration — user can refine the analysis in follow-up messages.",
  inputSchema: z.object({
    task: z.string().describe("What analysis to perform"),
    files: z.array(z.object({
      url: z.string().url(),
      filename: z.string(),
      mediaType: z.string(),
    })).describe("Structured chat file parts for xlsx/csv files"),
  }),
  execute: async ({ task, files }) => { /* ... */ },
})
```

### Sprite Dependencies (analyze_spreadsheet)

Default Sprite with all dependencies installed on first use. Claude Code is pre-installed on all Sprites by default.

| Component | Why |
|---|---|
| Python 3.13 + pip | Primary analysis language |
| pandas + openpyxl + xlsxwriter + matplotlib | DataFrame operations, Excel read/write, charts |
| LibreOffice Calc | Formula recalculation (recalc.py runs soffice --headless) |
| gcc | soffice.py compiles a C socket shim at runtime if AF_UNIX sockets are blocked |
| `/skills/xlsx/SKILL.md` | Anthropic's xlsx skill — formula rules, color coding, verification |
| `/skills/xlsx/scripts/recalc.py` | Formula recalculation + error scanning via LibreOffice |
| `/skills/xlsx/scripts/office/` | LibreOffice sandbox helpers |

Source: Anthropic xlsx skill vendored at `src/lib/sandbox/skills/xlsx/`

### Execution Flow

```
1. Look up the thread's Sprite session, then create or wake the thread-scoped Sprite by name
2. Download user's re-analyst skill files from Supabase Storage → /skills/re-analyst/
3. Runner downloads user's uploaded files, then writes them into /workspace/input/
4. sprite.execFile('claude', [
     '--dangerously-skip-permissions', '-p', prompt,
     '--allowedTools', 'Read,Write,Edit,Bash,Glob,Grep', '--max-turns', '20',
   ], { env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!, PATH: process.env.PATH! } })
5. Read /workspace/output/result.xlsx + /workspace/output/summary.txt from Sprite
6. Upload result.xlsx to Supabase Storage → generate download URL
7. Sprite auto-sleeps (ready for follow-up)
8. Return { downloadUrl, summary }
```

### Prompt Sent to Claude Code CLI

```
Read /skills/xlsx/SKILL.md for Excel best practices (formulas, color coding, verification).
Read /skills/re-analyst/SKILL.md and /skills/re-analyst/references/* for the user's
analysis preferences and domain knowledge. Follow them.

Task: {user's task description}

Input files are in /workspace/input/. Available files: {list of filenames}

Create an Excel financial model at /workspace/output/result.xlsx:
- Use Excel FORMULAS, not hardcoded Python calculations
- Blue text for editable inputs, black for formulas (per xlsx skill)
- Run: python /skills/xlsx/scripts/recalc.py /workspace/output/result.xlsx
- If errors found, fix formulas and recalculate until clean
- Write a human-readable summary to /workspace/output/summary.txt
```

### User Flow (Multi-Turn)

```
User: [uploads deals.xlsx]
      "Build me a comparison model for these 3 condos"

Sunder: "Analyzing your deals..."

  [Sprite created for this client → loads skills + file]
  [Claude Code reads xlsx skill + user's re-analyst skill]
  [writes Python, creates workbook with 3 sheets]
  [formulas: =PMT, =NPV, =SUM, sensitivity ranges]
  [runs recalc.py → finds 1 #DIV/0! → fixes → clean]
  [Sprite auto-sleeps]

Sunder: "Your financial model is ready!

  📊 [Download deals-comparison.xlsx]

  3 sheets: Assumptions | Per-Property Analysis | Comparison
  47 formulas, all verified clean.

  Tampines 2BR is the best pick:
  - Net yield 2.71% (beats your 2.5% benchmark)
  - TDSR 38.8% (well within 55% limit)

  Want me to change anything?"

User: "Add a sensitivity table for mortgage rates 2.5% to 4.5%"

Sunder: "Updating your model..."

  [Sprite wakes in <1s — all files still there]
  [Claude Code reads existing workbook, adds sensitivity sheet]
  [runs recalc.py → clean]
  [Sprite auto-sleeps]

Sunder: "Done! Updated model with 7x7 sensitivity table.

  📊 [Download deals-comparison-v2.xlsx]

  New sheet: Rate Sensitivity (2.5% to 4.5% in 0.25% steps)
  Tampines 2BR stays positive yield down to 3.75%."

User: "Perfect. Email this to my client Sarah."

  [runner uses send_message tool — no sandbox, existing platform tool]
```

## 7. Tool 2: `publish_artifact`

### Tool Definition

```typescript
publish_artifact: tool({
  description: "Generate and publish a web page — property showcases, pitch pages, "
    + "neighborhood guides, or open house landing pages. The page is built from a "
    + "pre-scaffolded React template, customized by Claude Code, and served via "
    + "a live preview URL. Use AFTER gathering property data via CRM/search/browser tools. "
    + "Supports multi-turn iteration — user can refine the page in follow-up messages.",
  inputSchema: z.object({
    task: z.string().describe("What page to create and any specific requirements"),
    propertyData: z.record(z.unknown()).describe("Property details assembled from CRM/search"),
    photoUrls: z.array(z.string()).optional().describe("Photo URLs to include"),
  }),
  execute: async ({ task, propertyData, photoUrls }) => { /* ... */ },
})
```

### Sprite Dependencies (publish_artifact)

| Component | Why |
|---|---|
| Node.js 22 | React/Vite runtime |
| `/template/` | Pre-scaffolded Vite + React + Tailwind project |
| `npm install` inside Sprite | First-run dependency install; persists across hibernation |
| `/template/src/components/` | Default property page components |

### Pre-Scaffolded Template

Written into the Sprite on first use so Claude Code tweaks instead of building from scratch:

```
/template/
├── package.json               ← Vite + React 18 + Tailwind 4 + lucide-react
├── vite.config.ts
├── index.html
├── src/
│   ├── App.tsx                ← layout shell
│   ├── components/
│   │   ├── Hero.tsx           ← full-bleed photo + address + price
│   │   ├── PhotoGallery.tsx   ← CSS grid gallery with lightbox
│   │   ├── PropertyDetails.tsx← beds / sqft / tenure / floor
│   │   ├── NeighborhoodMap.tsx← embedded map + amenity list
│   │   ├── Comparables.tsx    ← recent transactions table
│   │   ├── AgentContact.tsx   ← agent CTA with photo + phone + email
│   │   └── MortgageCalc.tsx   ← interactive mortgage calculator widget
│   ├── data/
│   │   └── property.json      ← placeholder, swapped at runtime
│   └── styles/
│       └── theme.css          ← neutral default theme; user skill controls aesthetic
└── build.sh                   ← npm run build → single-file HTML output
```

### Execution Flow

```
1. Runner gathers data FIRST (no sandbox):
     CRM lookup → property details, photos
     Web search → neighborhood amenities, schools, transport
     Browser scraping → listing photos (optional)
     Assembles propertyData JSON
2. Look up the thread's Sprite session, then create or wake the thread-scoped Sprite by name
3. Download user's frontend-design skill files from Supabase Storage → /skills/frontend-design/
4. Write propertyData to /workspace/data/property.json
5. Runner downloads photos, then writes them into /workspace/photos/
6. sprite.execFile('claude', [
     '--dangerously-skip-permissions', '-p', prompt,
     '--allowedTools', 'Read,Write,Edit,Bash,Glob,Grep', '--max-turns', '20',
   ], { env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!, PATH: process.env.PATH! } })
7. Start dev server via sprite.createService('dev-server', {
     cmd: 'bash', args: ['-lc', 'cd /workspace/app && npm run dev'],
   })
   Preview URL from sprite.url (must call sprite.updateURLSettings({ auth: 'public' }) first)
8. Sprite auto-sleeps (stays alive for follow-ups, preview URL wakes on request)
9. Return { previewUrl, summary }
```

### Prompt Sent to Claude Code CLI

```
Read /skills/frontend-design/SKILL.md for the user's brand and design preferences.
Read /workspace/data/property.json for property details.
Photos are in /workspace/photos/.

A React property showcase template is at /template/.
Copy it to /workspace/app/ and customize:
- Replace src/data/property.json with real property data
- Update theme (colors, fonts, layout) per SKILL.md brand guidelines
- Swap placeholder images with actual photos
- Add, remove, or modify sections as appropriate for this property
- The dev server will be started via sprite.createService() (Services survive hibernation, unlike detachable sessions)
- Preview URL is private by default — sprite.updateURLSettings({ auth: 'public' }) is called to make it accessible
```

### User Flow (Multi-Turn with Live Preview)

```
User: "Make a showcase page for the 42 Noriega listing"

Sunder (Flash, no sandbox yet):
  → CRM: fetches property — 3BR, $1.8M, 1200sqft, freehold
  → Web search: Botanic Gardens MRT 3min walk, 4 schools nearby
  → Browser: downloads 6 listing photos from PropertyGuru

Sunder: "Building your showcase page..."

  [Sprite created → loads skill + data + photos]
  [Claude Code reads frontend-design SKILL.md: "dark bg, gold accents"]
  [copies /template → /workspace/app]
  [swaps property.json, edits theme, updates components]
  [dev server started via sprite.createService() on port 8080]
  [Sprite auto-sleeps, preview URL stays active (must call sprite.updateURLSettings({ auth: 'public' }) for user access)]

Sunder: "Your showcase page is live!

  🔗 {sprite.url} (read from Sprite metadata, do not hardcode domain)

  Includes: hero with photo #1, gallery (6 images),
  property details, neighborhood map, your contact card.

  Want me to change anything?"

User: "Swap the hero to photo 3 and add a mortgage calculator"

Sunder: "Updating..."

  [Sprite wakes in <1s — all code still there, dev server Service survives hibernation]
  [Claude Code modifies Hero.tsx, adds MortgageCalc back]
  [preview URL auto-updates]

Sunder: "Done! Hero now uses photo 3, mortgage calculator
  added with your 3.8% rate as default.

  🔗 {sprite.url} (read from Sprite metadata, do not hardcode domain) (same URL, updated)"

User: "Make the cards bigger with more whitespace"

  [Sprite wakes, Claude Code tweaks CSS]

Sunder: "Updated. Cards are larger with more breathing room."

User: "Perfect. Send this to my client John."

Sunder: "Before I publish the final version — want me to build
  a static HTML so it lives permanently, or keep this preview URL?"

User: "Static HTML, permanent link"

  [Claude Code runs build.sh → single-file HTML]
  [Runner reads /workspace/app/dist/index.html]
  [Uploads to Supabase Storage or publishes via here.now]
  [Sprite killed — no longer needed]

Sunder: "Published!
  🔗 https://42-noriega.here.now
  Sent to John via WhatsApp."
```

## 8. Infrastructure

### Sprite Setup

**No custom templates.** Default Sprites come with Ubuntu (current LTS), Python, Node, Claude Code, and all common dev tools pre-installed. Additional dependencies are installed on first use and persist across hibernation:

```
First analyze_spreadsheet call on a new Sprite:
  → sprite.execFile('pip', ['install', 'pandas', 'openpyxl', 'xlsxwriter', 'matplotlib'])  ~15s
  → sprite.execFile('sudo', ['apt', 'install', '-y', 'libreoffice-calc', 'gcc'])           ~30s
  → write Anthropic xlsx skill files to /skills/xlsx/
  → persists forever — subsequent calls skip this

First publish_artifact call on a new Sprite:
  → write pre-scaffolded React template to /workspace/template/
  → sprite.execFile('npm', ['install'], { cwd: '/workspace/template' })                     ~20s
  → persists forever — subsequent calls just copy the template
```

After first use, the Sprite has everything and boots instantly (<1s wake from sleep).

### Environment Variables

```
SPRITES_TOKEN                    — Fly.io Sprites API token
ANTHROPIC_API_KEY                — Passed per-command via execFile() env option (not written to Sprite environment)

SDK: @fly/sprites@0.0.1-rc37 (pin prerelease — stable 0.0.1 lacks filesystem, services, and policy APIs)
Node: 24+ required (set in Vercel Project Settings → Node.js Version → 24.x)
```

### Cost Model

**Per-iteration costs (Sprites compute):**

| Resource | Rate | Typical per iteration |
|---|---|---|
| CPU (burst to 4 cores, avg 2) | $0.07/CPU-hr | ~$0.004-0.01 (30-90s) |
| Memory (1GB) | $0.04375/GB-hr | ~$0.001 |
| Hot storage (NVMe) | $0.000683/GB-hr | Negligible |
| **Sprite compute subtotal** | | **~$0.005-0.01** |

**Per-iteration costs (LLM):**

| Model | Rate | Typical per iteration |
|---|---|---|
| Claude Code (Sonnet) inside Sprite | ~$0.05-0.30 | ~$0.05-0.30 |
| Runner routing (Gemini Flash) | ~$0.001-0.005 | ~$0.001-0.005 |
| **LLM subtotal** | | **~$0.05-0.30** |

**Total per iteration: ~$0.06-0.31**

**Multi-turn session (4 iterations): ~$0.24-1.24**

**Idle cost between iterations: no idle compute cost while sleeping (storage still bills at $0.000027/GB-hr)**

Compare to v1 design (ephemeral Vercel Sandbox): ~$0.10-0.40 per invocation × 4 invocations = ~$0.40-1.60, plus re-upload and re-setup overhead each time.

### Limits

| Limit | Value |
|---|---|
| Max iterations per session | 10 (soft limit, configurable) |
| Agent CLI max turns per iteration | 20 |
| Max file upload size | 10 MB |
| Sprite auto-kill after inactivity | 24 hours |
| Concurrent Sprites per client | 3 (one per active thread) |
| Sprite resources | 2 vCPU, 1GB RAM (burst to 4 vCPU) |

## 9. Security

### Isolation Model

- Sprite runs in a **Firecracker microVM** — hardware-level isolation
- Each client gets their own Sprite — no shared state between clients
- `--dangerously-skip-permissions` is safe because the Sprite is isolated
- Files are explicitly copied in/out — no shared filesystem with the platform
- ANTHROPIC_API_KEY is the only secret passed (via `env` option on each `execFile()` call, not written to Sprite environment)
- **Network egress:** Domain allowlist via Sprites Layer 3 filtering — only `api.anthropic.com` + package registries

### What the Sprite CAN Do

- Read/write files within its own filesystem
- Run arbitrary Python/Node code
- Make outbound HTTP to allowlisted domains
- Iterate on errors autonomously
- Serve a dev server on port 8080 (preview URL, private by default — must set auth to public)

### What the Sprite CANNOT Do

- Access Supabase (no connection string injected)
- Access other clients' data (separate VMs)
- Access Sunder's CRM, memory, or connection tools
- Make arbitrary outbound network requests (egress allowlist)
- Run longer than 24h without activity

### Checkpoint Safety Net

Before risky operations (major code changes, dependency upgrades), Claude Code can checkpoint the Sprite (~300ms). If something breaks, the runner can rollback.

## 10. Relationship to Existing Codebase

### Builds On

| Existing Pattern | How Sandbox Uses It |
|---|---|
| Supabase Storage (`agent-files` bucket) | Skill files stored per-client, same as memory files |
| `toStoragePath()` / `toModelPath()` | Skill paths follow same `/agent/skills/` convention |
| `createRunnerTools()` factory | Two new tools added to registry |
| Tool response shape `{ success, ... }` | Both tools return same shape |
| `loadMemoryContext()` pattern | New `loadSkillFiles()` follows same download pattern |
| System prompt tool guidance | Add both tool descriptions to system prompt |

### Does NOT Change

- Runner loop (`streamText()` + `maxSteps`)
- CRM tools, memory tools, connection tools
- Context assembly (`assembleContext()`)
- Thread queue / concurrency model
- Approval system
- Chat API route

### New Files

```
src/lib/sandbox/
├── sprites-client.ts              — Sprites SDK wrapper (create, wake, exec, kill)
├── sprite-session.ts              — Per-client Sprite lifecycle (create/wake/sleep/kill)
├── run-claude-in-sprite.ts        — Claude CLI execution + output reading
├── skill-loader.ts                — Download skill files from Supabase Storage
└── types.ts                       — SpriteSession, SpriteResult types

src/lib/runner/tools/sandbox/
├── analyze-spreadsheet.ts         — analyze_spreadsheet tool definition
└── publish-artifact.ts            — publish_artifact tool definition

scripts/
└── setup-sprite-deps.sh            — Install dependencies on first Sprite use (pandas, LibreOffice, etc.)
```

### Database

New table: `sprite_sessions`

```sql
create table sprite_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  thread_id uuid references threads(id),
  sprite_id text not null,           -- Fly.io Sprite ID
  template text not null,            -- 'default' (single default Sprite model)
  status text not null default 'running', -- running | sleeping | destroyed
  preview_url text,                  -- from sprite.url metadata (for publish_artifact)
  created_at timestamptz default now(),
  last_active_at timestamptz default now(),
  destroyed_at timestamptz
);

-- RLS: clients can only see their own Sprites
alter table sprite_sessions enable row level security;
create policy "client_isolation" on sprite_sessions
  using (client_id = current_setting('app.client_id')::uuid);
```

## 11. Reference Implementations

### Primary References

| Repo / Resource | What we take from it |
|---|---|
| [diggerhq/opencomputer](https://github.com/diggerhq/opencomputer) | Architecture pattern: Claude Agent SDK inside persistent VM, `sandbox.agent.start()`, multi-turn sessions, preview URLs. See [Building Open Lovable Part 1](https://opencomputer.dev/guides/building-open-lovable-part-1). |
| [Sprites.dev](https://sprites.dev) + [Design & Implementation blog post](https://fly.io/blog/design-and-implementation/) | Infrastructure: Firecracker microVMs, S3-backed persistent storage, checkpoints, auto-sleep/wake, port 8080 preview URLs, egress filtering. |
| [vercel-labs/coding-agent-template](https://github.com/vercel-labs/coding-agent-template) | SDK patterns: `Sandbox.create()`, `runCommand()`, agent CLI inside sandbox, snapshot workflow. Useful as API reference even though we're not using Vercel Sandbox. |
| [Anthropic: Hosting the Agent SDK](https://platform.claude.com/docs/en/agent-sdk/hosting) | Three deployment patterns: ephemeral, long-running, hybrid. Sunder uses hybrid (persistent Sprite with session resumption). |
| [Harrison Chase: Two Patterns for Agents + Sandboxes](https://blog.langchain.com/the-two-patterns-by-which-agents-connect-sandboxes/) | Pattern taxonomy. Sunder uses Pattern 1 (Agent IN Sandbox) for coding tasks, Pattern 2 (Sandbox as Tool) is what the runner does for structured tools. |

### Skill References

| Repo | What we take from it |
|---|---|
| [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) | Skill file format (SKILL.md + scripts + references) |
| [anthropics/financial-services-plugins](https://github.com/anthropics/financial-services-plugins) | Production-grade DCF skill — formula verification, sensitivity tables, cell comments. Gold standard for RE analysis skill. |
| [anthropics/claude-cookbooks/skills/custom_skills](https://github.com/anthropics/claude-cookbooks/tree/main/skills/custom_skills) | Financial model skills — DCF, sensitivity analysis, ratio calculation. Skill structure and Python script patterns. |
| Anthropic xlsx skill (`/Users/sethlim/Downloads/xlsx/`) | Production-grade Excel skill with LibreOffice recalc, formula verification, socket shim for sandboxed VMs. |

### Internal Docs

| Doc | Location | Relevance |
|---|---|---|
| Sandbox reference comparison | `roadmap docs/.../references/sandboxes/sandbox-environments-comparison.md` | Full vendor comparison (Sprites, E2B, Modal, Cloudflare, Vercel) |
| Assembly pattern references | `roadmap docs/.../references/sandboxes/assembly-pattern-references.md` | 16 reference repos for gather → assemble → sandbox pattern |
| Assembly pattern playbook | `roadmap docs/.../references/sandboxes/assembly-pattern-playbook.md` | Strategic playbook with ranked implementations and decision guide |
| Built-In Services §13 | `roadmap docs/.../services/01-Built-In Services.md` | Full product spec: artifact publishing use cases, design skill principles |

## 12. Decision Log

| Decision | Choice | Rationale |
|---|---|---|
| Sandbox provider | Sprites (Fly.io) over Vercel Sandbox | Persistent VMs with auto-sleep solve multi-turn iteration with no idle compute cost while sleeping (storage still bills at $0.000027/GB-hr). Claude Code pre-installed. Preview URLs built-in. Fly.io is established and battle-tested. |
| Persistent sessions over ephemeral | Per-thread Sprites that auto-sleep | Users iterate 3-4 times per task. Re-booting and re-uploading each time is wasteful and loses context. Auto-sleep means no idle compute cost while sleeping (storage still bills at $0.000027/GB-hr). One Sprite per thread matches existing concurrency model. |
| Agent inside sandbox (not sandbox-as-tool) | Claude Code CLI runs inside Sprite | Sunder's runner is a business orchestrator, not a coding agent. Delegating coding tasks to Claude Code avoids building custom code-iteration logic. |
| Two dedicated tools (not one generic) | `analyze_spreadsheet` + `publish_artifact` | Different runtimes, different dependency sets, different outputs. Cleaner tool descriptions for the model. |
| Single default Sprite (no custom templates) | Default Ubuntu (current LTS) with Python + Node + Claude Code pre-installed | Deps installed on first use and persist across hibernation. No template maintenance burden. 100GB storage per Sprite is more than enough. |
| Anthropic xlsx skill bundled | Written on first use, not per-client | Same skill for all users. Production-grade formulas, color coding, recalc. |
| Pre-scaffolded React template bundled | Written on first use, not per-client | Agent tweaks template (~20-40s) instead of building from scratch (~60-180s). |
| User preferences in Supabase Storage | Per-client SKILL.md | Each client has different analysis/brand preferences. Same pattern as memory files. |
| Gemini Flash for routing, Claude for execution | Two-tier model | Flash is cheap for deciding when to use sandbox. Claude is powerful for writing + running code. |
| Preview via Sprite port 8080 (not static publish) | Live preview during iteration | User sees changes in real-time. Static publish only on final "ship it." |
| Sprite auto-kill after 24h inactivity | Cost safety net | Prevents forgotten Sprites from accumulating cost. |

## 13. Open Questions

1. ~~**One Sprite or two per client?**~~ **RESOLVED — One Sprite per thread.** Each thread gets its own Sprite with exactly the deps it needs. No dep conflicts, no concurrency collisions, matches existing thread serialization model. Max 3 concurrent Sprites per client.

2. **Streaming:** Should Sprite execution stream Claude Code's progress to the chat UI? Would improve UX for long-running analyses but adds complexity (SSE from Sprite → runner → chat UI).

3. **Cost controls:** Per-client daily/monthly limits on Sprite compute? Tied to billing tier?

4. **Template maintenance:** How to update baked-in templates (React components, xlsx skill) without breaking active Sprites? Version the templates?

5. **Cheap model routing (PR 54):** Can we swap Claude Code inside the Sprite to use a cheaper model via OpenRouter for simple iterations? The `ANTHROPIC_BASE_URL` env var approach from the original PR 54 design still applies.

6. ~~**Artifact iteration:**~~ **RESOLVED — Sprite stays alive between turns. Auto-sleeps when idle. Files persist. No need to pass previous output to a new sandbox.**

7. ~~**Sandbox provider:**~~ **RESOLVED — Sprites (Fly.io). Persistent VMs with auto-sleep, Claude Code pre-installed, preview URLs built-in, established company.**
