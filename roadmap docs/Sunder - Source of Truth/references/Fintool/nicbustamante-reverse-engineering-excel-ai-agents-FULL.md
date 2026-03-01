# Lessons from Reverse Engineering Excel AI Agents

**Author:** Nicolas Bustamante (@nicbstme), CEO of Fintool
**Date:** 2026-02-25
**Source:** X/Twitter Article
**URL:** https://x.com/nicbstme (article post)

---

## Summary

Reverse-engineered three production Excel AI agents: Claude in Excel (Anthropic), Microsoft's Copilot Excel Agent, and Shortcut AI. Compared tool schemas, error handling, verification loops, and pushed each to limits. Key finding: the model matters less than the tools — tool architecture is where the real differences live.

---

## The Three Architectures

```
THE EXCEL AI AGENT SPECTRUM

  |                                                                    |
  | FEWER TOOLS                                        MORE TOOLS     |
  | MORE FREEDOM                                       MORE GUARDRAILS|
  |<----------------------------------------------------------------->|
  |                                                                    |
  | Microsoft              Shortcut AI              Claude             |
  | 2 tools                11 tools                 14 tools           |
  | Raw Office.js          1 execute_code +         11 spreadsheet     |
  | No safety net          rich helper API          tools +            |
  |                        + 10 support tools       3 non-spreadsheet  |
  |                                                 Tool-enforced      |
  |                                                 safety             |
```

### Claude in Excel: 14 tools (11 spreadsheet + 3 non-spreadsheet)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLAUDE'S TOOL INVENTORY                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SPREADSHEET TOOLS (11)                                         │
│  ├── set_cell_range         Write values/formulas to cells      │
│  ├── get_cell_ranges        Read cell values + formatting       │
│  ├── get_range_as_csv       Read large ranges as CSV            │
│  ├── search_data            Find values across sheets           │
│  ├── clear_cell_range       Clear cells safely                  │
│  ├── copy_to                Copy/expand formula patterns        │
│  ├── modify_sheet_structure  Add/remove/rename sheets           │
│  ├── resize_range           Insert/delete rows/columns          │
│  ├── modify_object          Create/edit charts and shapes       │
│  ├── get_all_objects        List charts, tables, pivot tables   │
│  └── execute_office_js      RAW Office.js (escape hatch)        │
│                                                                 │
│  NON-SPREADSHEET TOOLS (3)                                      │
│  ├── bash_code_execution    Python sandbox                      │
│  ├── text_editor_code_execution  File editing in sandbox        │
│  └── web_search             Search with source hierarchy        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- Most opinionated tool design — each operation gets its own tool with a specific schema
- `set_cell_range` takes typed params: `cells` (2D array with value/formula/note/cellStyles/borderStyles), `allow_overwrite`, `explanation`, `copyToRange`, `resizeHeight`/`resizeWidth`
- Tool validates every parameter before executing — returns structured errors, not JS stack traces
- Locked to single model provider (Claude)

### Microsoft's Copilot Excel Agent: 2 tools, raw power

```
┌─────────────────────────────────────────────────────────────┐
│                  MICROSOFT'S TOOL INVENTORY                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. ExcelAgent_excel_interact_document                      │
│     → Runs arbitrary Office.js code in Excel                │
│     → The agent generates a full JavaScript program         │
│       every time it wants to do anything.                   │
│     → Maximum flexibility, minimal structural guardrails    │
│                                                             │
│  2. search_web                                              │
│     → Search the web for information                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- Radically different: two tools total
- Every operation funnels through one generic tool that generates and executes raw Office.js
- Schema is minimal: a single `program` parameter of type string
- Most token-efficient for simple tasks — one tool call packs entire section of financial model
- **Tradeoffs:** agent must produce syntactically correct Office.js every time; no tool-level safety enforcement; debugging harder (40-line script fails on line 32 = low signal)
- Routes between Claude and GPT models

### Shortcut AI: 11 tools, one generic + rich helpers

```
┌─────────────────────────────────────────────────────────────────┐
│                   SHORTCUT AI'S TOOL INVENTORY                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SPREADSHEET                                                    │
│  └── execute_code           TypeScript with rich helper API     │
│      Inside this one tool:                                      │
│      ├── sheet.setCell(), sheet.setCellRange()                  │
│      ├── sheet.getCellRange(), sheet.getRawRangeData()          │
│      ├── sheet.addChart(), sheet.addPivotTable()                │
│      ├── sheet.setCellStyle(), sheet.setIBTextColors()          │
│      └── ...dozens more helper methods                          │
│                                                                 │
│  SANDBOX & RESEARCH                                             │
│  ├── bash_command           Python 3.11 + Linux tools           │
│  ├── web_search             Web search (via execute_tool)       │
│  ├── web_crawl              Fetch URLs (via execute_tool)       │
│  ├── execute_tool           Dynamic tool invocation             │
│  └── get_tool_info          Look up tool schemas                │
│                                                                 │
│  AGENT & WORKFLOW                                               │
│  ├── task                   Spawn subagents                     │
│  ├── prepare_headless       Snapshot workbook for simulation    │
│  ├── take_screenshot        Vision via LLM                      │
│  ├── switch_mode            Toggle plan/action mode             │
│  └── todo_list              Track task progress                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- Middle ground with interesting twist: 1 generic `execute_code` tool with rich TypeScript helper API layered on top + 10 support tools
- Architecturally closer to Microsoft's Office.js but with better developer ergonomics
- Uses mix of Anthropic and OpenAI models with routing abstracted away
- **Best UX:** Plan mode breaks requests into structured steps; queries queued for multiple requests; follow-up interactions present structured options

### Same Operation, Three Ways (Writing "Revenue" to A1)

**WRITING "Revenue" TO CELL A1**

**Claude:**
```
Tool: set_cell_range
Params: { sheet: "Sheet1", range: "A1", values: [["Revenue"]] }
→ Tool validates, writes, returns formula_results
```

**Microsoft:**
```
Tool: ExcelAgent_excel_interact_document
Code: await Excel.run(async (ctx) => {
const sheet = ctx.workbook.worksheets.getItem("Sheet1");
sheet.getRange("A1").values = [["Revenue"]];
await ctx.sync();
});
→ Raw JavaScript, no validation layer
```

**Shortcut:**
```
Tool: execute_code
Code: async function execute() {
const sheet = await workbook.getSheet("Sheet1");
await sheet.setCell("A1", "Revenue");
}
→ Helper API wraps Office.js, cleaner but still generic
```

- **Claude:** `set_cell_range` with typed params → validates, writes, returns formula_results
- **Microsoft:** Raw `Excel.run` Office.js → no validation layer
- **Shortcut:** `execute_code` with helper API `sheet.setCell()` → cleaner but still generic

---

## How They See Your Spreadsheet

### Lazy Loading (Claude, Shortcut)

**WHAT CLAUDE ACTUALLY RECEIVES PER MESSAGE**
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  <user_context>                                     │
│      active_sheet: "Sheet1"                         │
│      selected_range: "B5:B10"                       │
│  </user_context>                                    │
│                                                     │
│  <initial_state>  (first message only)              │
│      file: "Q4_Model.xlsx"                          │
│      sheets:                                        │
│          - Sheet1: 50 rows x 8 cols, 2 frozen rows  │
│          - Assumptions: 30 rows x 5 cols            │
│          - DCF: 45 rows x 12 cols                   │
│      total_sheets: 3                                │
│  </initial_state>                                   │
│                                                     │
│  NO cell values. NO formulas. NO formatting.        │
│  Claude must call tools to read ANYTHING.            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- Agent receives tiny metadata summary: sheet names, dimensions, active sheet, selected cell
- No values, no formulas, no formatting until explicitly requested via tools
- Better for complex models (50 sheets, 100K rows) — don't pay context cost for unused data

### Eager Loading (Microsoft)

**WHAT MICROSOFT'S AGENT RECEIVES PER MESSAGE**
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Sheet names: [Sheet1, Assumptions, DCF]                │
│  Active cell: B5                                        │
│  Used range preview:                                    │
│      A1: "Revenue"     B1: "2024"      C1: "2025"      │
│      A2: 1500000       B2: 1650000     C2: 1815000     │
│      A3: "COGS"        B3: "=B2*0.6"  C3: "=C2*0.6"   │
│      ...                                                │
│  (first N rows of values and formulas)                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Gets preview of actual values from used ranges per message
- Better for quick questions ("what's in cell B5?")
- Context cost: every token costs money, adds latency, can make model dumber past a threshold

```
┌─────────────────────────────────────────────────────────────────┐
│                 │ LAZY LOADING          │ EAGER LOADING          │
│                 │ (Claude/Shortcut)     │ (Microsoft)            │
├─────────────────┼───────────────────────┼────────────────────────┤
│ Tokens/message  │ Low (~100)            │ High (~1000+)          │
│ Tool calls needed│ More (must read)     │ Fewer (data here)      │
│ Context pollution│ Minimal              │ Grows fast             │
│ Large workbooks │ Handles well          │ Gets expensive         │
│ Simple tasks    │ Slower start          │ Faster start           │
└─────────────────┴───────────────────────┴────────────────────────┘
```

**Key insight:** Context isn't free. Lazy loading is a context management strategy disguised as a technical implementation detail.

---

## The Overwrite Protection Spectrum

**The most important design decision in the entire architecture.**

**OVERWRITE PROTECTION: THREE PHILOSOPHIES**
```
┌─────────────────────┬─────────────────────┬─────────────────────┐
│     Microsoft       │    Shortcut AI      │      Claude         │
├─────────────────────┼─────────────────────┼─────────────────────┤
│                     │                     │                     │
│  NONE               │  BEHAVIORAL         │  TOOL-ENFORCED      │
│                     │                     │                     │
│  The API happily    │  The API happily    │  The tool BLOCKS    │
│  overwrites any     │  overwrites any     │  the write.         │
│  cell. No block.    │  cell. No block.    │  Returns error      │
│  No warning.        │  No warning.        │  with existing      │
│  No confirmation.   │                     │  cell values.       │
│                     │  System prompt:     │                     │
│  The model just     │  "Do not            │  Agent MUST read    │
│  has to remember    │  overwrite          │  the data, show     │
│  to be careful.     │  existing data      │  the user, ask      │
│                     │  unless             │  permission, and    │
│                     │  explicitly         │  retry with         │
│                     │  requested."        │  allow_overwrite    │
│                     │                     │  = true.            │
│                     │                     │                     │
└─────────────────────┴─────────────────────┴─────────────────────┘
```

### Claude: Tool-enforced (structural safety)
1. Agent calls `set_cell_range` with `allow_overwrite: false` (default)
2. Tool detects existing data → returns error showing what's there
3. Agent presents to user for consent
4. User approves → agent retries with `allow_overwrite: true`
- Exception path: explicit overwrite language in user request skips consent
- **Key:** blocking is in the tool, consent is in the prompt. Default-deny at API level = accidental overwrites require active decision

### Microsoft: No protection
- Just overwrites. No blocking mechanism or confirmation dialog.

### Shortcut: Behavioral only (prompt-based)
- System prompt says don't overwrite unless explicitly requested
- API itself happily overwrites anything
- Protection exists only in model compliance with text instruction

**Lesson for all agent builders:** Behavioral safety fails. Models skip instructions, hallucinate, get confused. Only reliable safety is structural safety baked into the tool interface.

---

## The Two-Tier Tool Hierarchy

Every agent has: safe path for common operations + escape hatch for everything else.

**CLAUDE'S TWO TIERS**
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  TIER 1: STRUCTURED TOOLS (safe, validated, verified)           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ set_cell_range       → overwrite protection, auto-      │    │
│  │                        verification via formula_results │    │
│  │ get_cell_ranges      → structured read with formatting  │    │
│  │ modify_object        → chart/shape creation with params │    │
│  │ search_data          → find values across all sheets    │    │
│  │ copy_to              → pattern expansion with safety    │    │
│  │ ...11 spreadsheet tools                                 │    │
│  │                                                         │    │
│  │ ✓ Overwrite protection                                  │    │
│  │ ✓ formula_results returned automatically                │    │
│  │ ✓ Structured errors                                     │    │
│  │ ✓ Parameter validation                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  TIER 2: ESCAPE HATCH (raw power, no guardrails)                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ execute_office_js    → raw Office.js                    │    │
│  │                                                         │    │
│  │ ✗ No overwrite protection                               │    │
│  │ ✗ No auto-verification                                  │    │
│  │ ✗ Full Office.js API surface area                       │    │
│  │ ✗ Can do anything Excel supports                        │    │
│  │ ✗ Can also break anything Excel supports                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- **Claude:** Explicit hierarchy in system prompt — prefer structured tools, escalate to `execute_office_js` only when structured can't do it (conditional formatting, data validation, sorting, filtering, named ranges)
- **Shortcut:** De facto two-tier via helper API (`sheet.setCell()` = safe path) vs raw Office.js inside `execute_code` (escape hatch)
- **Microsoft:** Entirely escape hatch mode — every operation through raw Office.js

**THE TWO-TIER PATTERN ACROSS AI AGENTS**
```
┌──────────────────┬────────────────────────┬────────────────────────┐
│     Agent        │      Safe Path         │     Escape Hatch       │
├──────────────────┼────────────────────────┼────────────────────────┤
│ Claude in Excel  │ 10 structured          │ execute_office_js      │
│                  │ spreadsheet tools      │                        │
├──────────────────┼────────────────────────┼────────────────────────┤
│ Claude Code      │ Read, Edit,            │ Bash                   │
│                  │ Write, Grep            │                        │
├──────────────────┼────────────────────────┼────────────────────────┤
│ GitHub Copilot   │ Structured code        │ Terminal               │
│                  │ tools                  │                        │
├──────────────────┼────────────────────────┼────────────────────────┤
│ Shortcut AI      │ Helper API             │ Raw Office.js          │
│                  │ (setCell, etc.)        │ inside execute_code    │
└──────────────────┴────────────────────────┴────────────────────────┘
```

**Principle:** Constrained tools for common ops (with validation, safety checks, structured responses). Raw power for edge cases. The ratio matters — too many structured tools = slow; too few = no guardrails.

---

## The Blind Agents Problem

**THE VISION GAP**
```
┌─────────────────────┬─────────────────────┬─────────────────────┐
│      Claude         │     Microsoft       │     Shortcut        │
├─────────────────────┼─────────────────────┼─────────────────────┤
│                     │                     │                     │
│  BLIND              │  BLIND              │  SIGHTED            │
│                     │                     │                     │
│  Knows A1           │  Knows A1           │  Knows A1 has       │
│  has blue           │  has value          │  "Revenue" in blue  │
│  font color         │  "Revenue"          │  AND can see it's   │
│  ■ #0000FF          │                     │  misaligned with    │
│  (from              │  (no color          │  the column header  │
│  structured         │  info at            │  AND the chart next │
│  data)              │  all)               │  to it is overlapping│
│                     │                     │  the data range     │
│  Cannot see         │  Cannot see         │                     │
│  how it             │  anything           │  take_screenshot    │
│  actually           │  visual             │  → vision LLM       │
│  looks              │                     │  → structured       │
│                     │                     │    description      │
│                     │                     │                     │
└─────────────────────┴─────────────────────┴─────────────────────┘
```

- **Claude:** Cannot see colors, visual layouts, chart rendering — works from structured data only
- **Microsoft:** Cannot see images or compare visually
- **Shortcut:** Has `take_screenshot` tool → captures pixels → sends to vision LLM (gemini-3-flash-preview or claude-haiku-4-5-20251001)

**Implications:** Claude can tell you a cell has font color #0000FF but can't tell you it's invisible against dark background. Can create chart with correct data but can't see it overlapping a table.

Both Claude and Microsoft said their #1 desired improvement is visual feedback.

**This will be a defining capability for next-gen agents** — any agent modifying visual output needs to see the result. Structured data tells you what's there; vision tells you if it's right.

---

## The Python Sandbox Bridge

**THE TWO WORLDS**
```
┌──────────────────────────┐  ┌──────────────────────────┐
│       WORLD 1:           │  │       WORLD 2:           │
│  TYPESCRIPT / OFFICE.JS  │  │      PYTHON 3.11         │
│                          │  │                          │
│  Can read/write Excel    │  │  pandas, numpy, scipy    │
│  Cannot run Python       │  │  pdfplumber, matplotlib  │
│  Cannot access filesystem│  │  openpyxl, beautifulsoup │
│                          │  │  Cannot touch Excel      │
│  sheet.setCell("A1", 100)│  │  df = pd.read_csv(...)   │
│  sheet.addChart(...)     │  │  result = df.describe()  │
│  sheet.getCellRange(...) │  │  plt.savefig(...)        │
└────────────┬─────────────┘  └────────────┬─────────────┘
             │                             │
             └──────────┬──────────────────┘
                        │
              ┌─────────┴─────────┐
              │  THE AGENT IS THE │
              │    ONLY BRIDGE    │
              ├───────────────────┤
              │                   │
              │    AI Agent       │
              │  1. Read from     │
              │     Excel         │
              │  2. Pass to       │
              │     Python        │
              │  3. Get result    │
              │  4. Write back    │
              │     to Excel      │
              │                   │
              └───────────────────┘
```

- **Claude and Shortcut:** Have Python sandboxes (isolated from Excel environment)
- **Microsoft:** No sandbox — no Python, no pandas, no PDF parsing

### Shortcut's Bridge (cleanest):
1. `execute_code` (TypeScript) reads data from Excel, sets `store.data`
2. `bash_command` (Python) reads via `from_store`, materializes as file
3. Python processes, writes output via `to_store`
4. `execute_code` reads `store.result`, writes back to Excel

### Claude's Bridge:
- Agent reads data via structured tools → passes to Python sandbox via `bash_code_execution` → gets result → writes back via structured tools
- Claude is the intermediary shuttling data between two isolated worlds

**Shortcut detail:** Sandbox runs on GCS infrastructure. No append operations (`>>` or `tee -a`) — must read entire file, modify in memory, overwrite.

---

## The Bloomberg Formula Trick

Claude writes `=BDP("AAPL US Equity", "PX_LAST")` into a cell. If user has Bloomberg Terminal, the add-in resolves it. Claude doesn't need Bloomberg access — just needs formula syntax.

- **Claude:** Detailed formula docs for Bloomberg (`=BDP`, `=BDH`, `=BDS`), FactSet (`=FDS`, `=FDSH`), Capital IQ (`=CIQ`, `=CIQH`), Refinitiv (`=TR`). Strict source hierarchy for web search fallback — only company IR pages, SEC filings, regulatory disclosures.
- **Shortcut:** 18+ financial data terminal syntaxes in dedicated skill files at `/skills/default/integrations/`
- **Microsoft:** Can write formulas as strings but no structured knowledge of terminal syntax

**Broader pattern:** Agent programming another agent through shared medium (spreadsheet). Expect more of this as agents operate in environments with other agents.

---

## The Self-Verification Loop

### Claude: Verification baked into tool response (zero extra cost)

**CLAUDE'S VERIFICATION (ZERO EXTRA COST)**
```
  Agent calls:  set_cell_range(
                    range: "B2:B5",
                    values: [100, 200, 300],
                    formulas: [null, null, null, "=SUM(B2:B4)"]
                )
                        │
                        ▼
  Tool returns: {
      "success": true,
      "formula_results": { "B5": 600 }
  }
                        │
                        ▼
  Agent checks: "B5 should be 100+200+300 = 600. Got 600. ✓"
```

- `set_cell_range` automatically reads back computed values as `formula_results`
- System prompt instructs checking for `#VALUE!`, `#REF!`, `#NAME?`, `#DIV/0!`
- Happens in same round-trip — no extra tool call, latency, or tokens
- Agent also chose to do full audit read-back at end (behavioral + structural)

### Shortcut: Manual but batchable
- Write values → `workbook.calculate()` → read back in same `execute_code` block
- 1-2 tool calls; agent must choose to verify

### Microsoft: Verify if you remember to
- Can verify within same `Excel.run` block via `range.load('values'); await context.sync()`
- But verification is optional and behavioral — often skipped for simple ops
- Implicit efficiency pressure: longer code = more bugs in code itself

**VERIFICATION APPROACHES COMPARED**
```
┌───────────────────┬──────────────────┬──────────────────┬──────────────────┐
│                   │     Claude       │    Shortcut      │   Microsoft      │
├───────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Mechanism         │ formula_results  │ calculate()      │ Separate         │
│                   │ auto-returned    │ + read-back      │ read cycle       │
├───────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Extra tool calls  │ 0                │ 0-1              │ 0 (in-block)     │
├───────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Automatic?        │ Yes (always)     │ No (agent        │ No (agent        │
│                   │                  │ must choose)     │ must choose)     │
├───────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Cost              │ Free             │ Extra tokens     │ Extra code       │
│                   │                  │ + latency        │ in same call     │
└───────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

**Key principle:** If safety-critical behavior depends on model choosing to do it, eventually it won't. Make the right thing the easy thing.

---

## Memory, Simulation, and What's Broken

### Persistent Memory
- **Claude & Microsoft:** Zero memory across sessions
- **Shortcut:** Real persistent memory via files:
  - `/memories/MEMORY.md` — curated preferences
  - `/memories/{date}.md` — daily session notes
  - `/memories/traces/{workbook_id}/{date}/{thread_id}.json` — raw traces
  - System prompt: "Your context is limited. If you want to remember something, WRITE IT TO A FILE."

### Simulation (Shortcut only)
- `prepare_headless_session` creates copy of workbook on headless server
- Subagent can experiment freely without touching real data
- Verified working in live demo

### Checkpoint/Restore (Shortcut — broken)
- API exists: `general.restoreCheckpoint(id)`
- But checkpoint IDs not surfaced back after creation — can't actually restore

### SEC EDGAR Pipeline (Shortcut only)

**SHORTCUT'S SEC EDGAR PIPELINE**
```
  1. bash_command → curl SEC company tickers JSON
                    → find AAPL CIK (320193)
                    │
                    ▼
  2. bash_command → curl SEC submissions API for CIK 0000320193
                    → find latest 10-K filing URL
                    │
                    ▼
  3. bash_command → python /skills/default/sec-edgar/sec_to_pdf.py
                    → Playwright + headless Chrome converts
                      HTML filing to PDF
                    │
                    ▼
  4. task (document_reader) → Spawn subagent on the PDF
                              → Extract revenue figures
                    │
                    ▼
  5. execute_code → Write extracted data to spreadsheet
                    with source notes
```

- Dedicated pipeline at `/skills/default/sec-edgar/`
- Playwright with real Chrome (not Chromium — SEC blocks headless with 403s)
- Why not parse HTML directly? SEC filings have inline XBRL (HTML + embedded XML) creating noise for LLMs. ~34% of filings have XBRL tagging errors. Chrome rendering resolves to clean visual representation.
- Neither Claude nor Microsoft has anything comparable

### Shortcut Skills Marketplace
- Community-created and default skills encoding domain expertise as reusable workflows
- Notable installs: `financial-modeling-skill` (254), `formatting-refinement` (157), `deck-builder` (120), `lbo-best-practices` (99), `model-grader` (97), `excel-model-audit` (86)
- Includes: amortization schedules (ASC 805), PPA, bank statement ETL, Chapter 11 time entries, nonprofit NTEE lookups
- Users can upload own templates

**"Skills as moat"** — most concrete example. Each skill encodes domain expertise that took years to develop. Install counts show compounding adoption.

---

## The DCF Test: Same Prompt, Three Agents

Prompt: "Create a detailed 10-year DCF valuation model for Apple (AAPL). Professional-grade output with assumptions, revenue build-up, FCF projections, terminal value, and implied share price."

**THE DCF TEST: HOW EACH AGENT WORKS**
```
                    Shortcut              Claude                Copilot
                    ────────              ──────                ───────
Before              3 clarifying          7 clarifying          No questions.
building            questions with        questions with        Starts
                    recommendations.      defaults.             immediately.
                    Plan mode +           "Go" to accept
                    todo list.            defaults.

Revenue             Segment-level.        Top-line only.        Top-line only.
approach            5 segments with       Blended growth        Blended growth
                    individual growth     tapering 5%→3%.       tapering 6%→3.5%.
                    rates. Captures       Misses mix shift.     Misses mix shift.
                    Services margin
                    expansion.

Base year           FY2025 ($416B)        FY2024 ($391B)        FY2024 ($391B)

After               Vision: took          Read-back: loaded     Editorial: added
building            screenshots,          every key output      commentary on why
                    verified              and verified          Apple trades above
                    formatting via        against               DCF fair value.
                    vision LLM.           expectations.         No verification
                    Saved preferences                           of outputs.
                    to memory.

File audit          Zero errors.          All formulas          Broken sensitivity
results             Every formula         correct. One          table, 3 note/model
                    verified.             unused input          mismatches, formula
                    Self-contained        (buyback rate         error, hardcoded
                    sensitivity           defined but           scenarios, format
                    table.                never wired).         bug.

Implied             $187                  $118                  $123
share price         (-29% vs current)     (-55% vs current)     (-54% vs current)
```

### Shortcut ($187 implied vs $263 current)
- **Asked 3 questions first** (sheet layout, revenue granularity, terminal value method)
- Recommended segment-level revenue: "Services growing 2-3x hardware, ~70% gross margins vs ~36% for products"
- Plan mode: structured 7-item todo list
- Used FY2025 actuals as base ($416B revenue)
- Took screenshots → ran through vision LLM to verify formatting
- Saved preferences to memory
- **Audit: Zero formula errors.** Sensitivity table self-contained with proper discounting. Standard financial border conventions. Minor: no freeze panes, interest expense hardcoded at 0.7%.

### Claude ($118 implied vs $265 current)
- Asked 7 clarifying questions, each with sensible defaults
- 6 web searches for exact financials from official filings
- Section-by-section build via individual `set_cell_range` calls
- Sensitivity table required Python fallback (structured tools not optimized for complex cross-sheet formulas)
- Full audit read-back at end
- **Audit: All formulas correct.** Sensitivity uses elegant SUMPRODUCT array formulas. One oversight: "Annual Share Buyback Rate = 2.5%" defined as input but never referenced — shares stay flat for 10 years. Used FY2024 base, blended top-line growth.

### Microsoft Copilot ($123 implied vs $265 current)
- **Asked zero questions.** Went straight to building.
- Fast: handful of massive Office.js scripts building entire sections at once
- Added editorial commentary (not asked for)
- **Audit: Multiple issues:**
  - Sensitivity table structural flaw: `$B$77` references base WACC sum — only re-discounts terminal value, FCF stream frozen at base WACC
  - Methodology notes contradict actual inputs (3 mismatches)
  - Formula error in FCF growth calculation (L58)
  - Bear/Bull scenario prices hardcoded text, not computed
  - "Projection Period = 10" formatted as percentage (shows "1000.00%")

### Key Insight
Quality gap maps directly to architecture:
- Shortcut's plan mode caught modeling decision upfront; vision verified output
- Claude's auto-verification caught formula errors in real time
- Copilot generated large scripts with no verification layer — errors accumulated undetected

---

## Five Questions Every Agent Must Answer

**THE FIVE QUESTIONS EVERY AGENT MUST ANSWER**
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1. HOW MUCH SHOULD TOOLS CONSTRAIN THE MODEL?                  │
│     14 purpose-built tools with schemas and validation          │
│     vs. 2 raw tools that execute arbitrary code                 │
│                                                                 │
│  2. HOW MUCH CONTEXT SHOULD EACH MESSAGE CARRY?                 │
│     Lazy metadata (~100 tokens, must ask for everything)        │
│     vs. Eager previews (~1000+ tokens, data available upfront)  │
│                                                                 │
│  3. WHERE SHOULD SAFETY LIVE?                                   │
│     In the tool (API blocks dangerous operations)               │
│     vs. In the prompt (model is told to be careful)             │
│                                                                 │
│  4. HOW SHOULD VERIFICATION WORK?                               │
│     Baked into tool responses (free, automatic)                 │
│     vs. Separate verification steps (extra cost, optional)      │
│                                                                 │
│  5. WHAT CAN THE AGENT SEE?                                     │
│     Structured data only (values, formulas, metadata)           │
│     vs. Actual visual output (screenshots, rendered result)     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

1. **How does the agent see its environment?** (Lazy vs eager loading)
2. **How does it protect existing data?** (Tool-enforced vs behavioral)
3. **What's the safe path vs escape hatch?** (Structured tools vs raw code)
4. **Can it see its own output?** (Vision capability)
5. **How does it verify correctness?** (Auto-verification vs optional)

---

## Key Takeaways for Agent Design

1. **Claude's tool-enforced safety is the most mature design** — overwrite protection in the tool, verification automatic. This scales. Can't rely on model choosing to be careful across millions of sessions.

2. **Shortcut's ambition points to where all agents are headed** — vision, persistent memory, simulation, multi-agent orchestration. Some half-baked today; won't be for long.

3. **Microsoft's simplicity is a starting point, not a ceiling** — two tools, raw Office.js, fastest path. Gap can be closed with engineering (not research). Microsoft owns the platform. Will likely win on distribution.

4. **The future is Claude's safety architecture with Shortcut's feature set** — tool-enforced guardrails + vision + memory + simulation.

5. **Model is commodity; tool architecture is moat today but temporary** — an elite team can build Claude's 14-tool architecture in months.

6. **The real moat is above the harness:**
   - Skills (community workflows encoding years of domain expertise)
   - Persistent memory (learns preferences over hundreds of sessions)
   - User data that compounds (formatting conventions, templates, formula patterns)
   - "The agents that accumulate this context will be the ones users can't leave"

7. **"If the spreadsheet is the final product where users live and edit, tool-enforced safety and visual verification are critical. If the spreadsheet is an output artifact from a larger agentic workflow, token efficiency and raw speed matter more."**

---

## Sunder-Relevant Patterns

- **Structural safety > behavioral safety** — bake guardrails into tool interfaces, don't rely on prompt instructions
- **Two-tier tool hierarchy** — safe path for common ops + escape hatch for edge cases; ratio matters
- **Auto-verification at tool level** — make the right thing the easy thing (return computed values automatically)
- **Lazy loading for context management** — don't pay context cost for data you don't need
- **Skills as moat** — community-created domain expertise workflows compound with adoption
- **Vision for output verification** — any agent modifying visual output needs to see the result
- **Memory via files** — simple but effective persistent memory ("if you want to remember, WRITE IT TO A FILE")
- **Agent-to-agent programming** — agents writing instructions for other tools/agents through shared mediums
- **Python sandbox bridge pattern** — two isolated worlds connected by agent as intermediary
