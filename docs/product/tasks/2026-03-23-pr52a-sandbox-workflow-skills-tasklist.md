# Sandbox Workflow Skills

**PR:** PR 52a: Sandbox workflow skills
**Decisions:** Design doc `docs/product/designs/sandbox-skill-execution.md` §4-6
**Goal:** Ship the skill files that teach the runner how to orchestrate data gathering before handing off to sandbox tools (`analyze_spreadsheet`, `publish_artifact`). Two layers: outer workflow skills (guide the runner) and inner coding skills (guide Claude Code inside the Sprite).

**Why this matters:** Without these skills, the runner will ad-lib the data gathering workflow every time. Sometimes it'll forget to check CRM. Sometimes it'll skip neighborhood data. Sometimes it'll call the sandbox tool before gathering photos. The skills formalize the "gather first, then hand off" pattern so it's consistent and correct.

**Architecture:** Same skill system from PR 51 — SKILL.md files in Supabase Storage, discovered by `discoverUserSkills()`, loaded on demand via `getSkillContent()`. Outer skills are platform defaults (bundled in `skill-templates.ts`). Inner skills are user-editable (seeded to storage on first use, customized through conversation).

**Tech Stack:** TypeScript, Supabase Storage, Vitest

**Depends on:** PR 51/51a (skill system — `discoverUserSkills()`, `getSkillContent()`, `bootstrapSkills()`, `skill-templates.ts`)

**Reference:**
- Fintool skill philosophy: `roadmap docs/.../Fintool/nicbustamante-fintool-lessons-building-ai-agents-FULL.md` §5 "Skills Are Everything"
- Anthropic DCF skill: `anthropics/financial-services-plugins/financial-analysis/skills/dcf-model/SKILL.md`
- Existing skills for pattern: `src/lib/runner/skills/skill-templates.ts` (8 defaults)
- Design doc: `docs/product/designs/sandbox-skill-execution.md` §4-6

---

## Relevant Files

### Modify
- `src/lib/runner/skills/skill-templates.ts` — add 3 outer workflow skills + 2 inner coding skills to defaults
- `src/lib/ai/system-prompt.ts` — add guidance explaining outer vs inner skills and the gather→hand-off pattern

### Create
- `src/lib/runner/skills/__tests__/sandbox-skills.test.ts` — verify skill content, triggers, tool references
- `docs/product/references/re-analyst-domain-knowledge.md` — SG real estate reference material for the re-analyst skill

### Reference (read, don't modify)
- `src/lib/runner/skills/discover-skills.ts` — `discoverUserSkills()`, `parseFrontmatter()`
- `src/lib/runner/skills/skill-bootstrap.ts` — `bootstrapSkills()` seeds defaults
- `src/lib/storage/agent-files.ts` — `assertWritable()` for skill path access control
- `docs/product/designs/sandbox-skill-execution.md` — architecture context

---

## Skill Inventory

### Outer workflow skills (runner reads, platform defaults)

These teach the runner what data to gather and when to call the sandbox tools. They are bundled in `skill-templates.ts` and seeded to all clients.

| Skill | Trigger | Tools used | Sandbox tool |
|---|---|---|---|
| `deal-comparison` | "compare these deals", uploads xlsx, "which property is better" | search_crm, web_search, read_file → analyze_spreadsheet | analyze_spreadsheet |
| `property-showcase` | "showcase page", "listing page", "marketing page" | search_crm, read_file, web_search, browser_scrape, fetch_url → publish_artifact | publish_artifact |
| `market-report` | "market report", "area analysis", "transaction trends" | web_search, browser_scrape, search_crm → analyze_spreadsheet | analyze_spreadsheet |

### Inner coding skills (Claude Code reads, user-editable)

These guide Claude Code's coding style inside the Sprite. They are seeded as defaults but the user customizes them through conversation ("set up my analysis preferences").

| Skill | What it steers | Editable by user |
|---|---|---|
| `re-analyst` | Financial analysis preferences — yield benchmarks, mortgage assumptions, metrics to include, SG-specific rules | Yes — "my mortgage is 3.8%", "always check TDSR" |
| `frontend-design` | Brand and design preferences — colors, typography, layout, components to always include | Yes — "dark backgrounds, gold accents, always include my contact card" |

---

## Task 1: Write the `deal-comparison` outer skill

**Files:**
- Modify: `src/lib/runner/skills/skill-templates.ts`

**Step 1: Add to DEFAULT_SKILL_SLUGS**

Add `"deal-comparison"` to the `DEFAULT_SKILL_SLUGS` array and update the `DefaultSkillSlug` type.

**Step 2: Write the skill content**

Add to `DEFAULT_SKILL_CONTENT`:

```typescript
"deal-comparison": `---
name: deal-comparison
description: "Compare properties side-by-side with a professional Excel financial model. Use when the user uploads xlsx/csv files, asks to compare deals, or wants to know which property is better. Produces a downloadable Excel model with live formulas, sensitivity tables, and color-coded inputs."
---

# Deal Comparison

Build a professional Excel financial model comparing properties side-by-side.

## Before you start

Check if the user uploaded files:
- If yes, note the file URLs — these are the primary input
- If no, ask which properties to compare, then search CRM

## Workflow

### Step 1: Gather property data from CRM

For each property the user mentions, search CRM:

\\\`\\\`\\\`
search_crm({ query: "{property name or address}", table: "deals" })
\\\`\\\`\\\`

Collect: purchase price, size (sqft), tenure, floor, unit number, asking rent, any notes.

### Step 2: Get market context

Search for recent comparable transactions:

\\\`\\\`\\\`
web_search({ query: "{project name} recent transactions {year}" })
\\\`\\\`\\\`

This gives the model comparison points for sensitivity analysis.

### Step 3: Read user context

\\\`\\\`\\\`
read_file("/agent/SOUL.md")
\\\`\\\`\\\`

Note the user's market focus, client context, and any relevant preferences.

### Step 4: Hand off to coding agent

Call analyze_spreadsheet with everything gathered. Include in the task description:
- What specific analysis the user wants
- Number of properties and their addresses
- Any specific metrics or benchmarks they mentioned
- Supplementary data from steps 1-3

\\\`\\\`\\\`
analyze_spreadsheet({
  task: "{user's request + enriched context}",
  fileUrls: ["{uploaded file URLs if any}"]
})
\\\`\\\`\\\`

**IMPORTANT:**
- Do NOT calculate yields, mortgage payments, or financial metrics yourself in chat text
- Do NOT write formulas or Python code in the conversation
- The sandbox agent has the user's re-analyst skill with their exact preferences and benchmarks
- Let the coding agent handle ALL computation — it produces proper Excel with live formulas

## After the model is ready

Present the summary and download link. Offer to:
- Email it to someone (use send_message)
- Refine it ("add a sensitivity table", "remove property 3")
- Do a follow-up analysis

## Follow-up patterns

For refinements, call analyze_spreadsheet again with the new request.
The sandbox remembers the previous work — no need to re-upload files or re-explain context.

## Gotchas

- Never approximate financial calculations in chat. Always use the sandbox tool.
- If the user asks "which is better?" — run the model FIRST, then give your opinion based on the numbers.
- SG-specific: always mention ABSD/BSD applicability and TDSR if relevant.
- If the user hasn't set up their re-analyst preferences yet, suggest they do ("want me to set up your analysis preferences first?").
`,
```

Run: `npx tsc --noEmit` — should compile.

---

## Task 2: Write the `property-showcase` outer skill

**Files:**
- Modify: `src/lib/runner/skills/skill-templates.ts`

**Step 1: Add to DEFAULT_SKILL_SLUGS**

Add `"property-showcase"` to the array.

**Step 2: Write the skill content**

```typescript
"property-showcase": `---
name: property-showcase
description: "Build a polished property showcase web page with photos, details, neighborhood info, and your contact card. Published to a live preview URL that you can iterate on and then share with clients. Trigger with 'showcase page', 'listing page', 'property page', 'marketing page for [property]'."
---

# Property Showcase

Build a polished, shareable property showcase page.

## Workflow

### Step 1: Identify the property

If the user named a property, search CRM:

\\\`\\\`\\\`
search_crm({ query: "{property name or address}", table: "deals" })
\\\`\\\`\\\`

Collect: address, price, beds, sqft, tenure, floor, any listing notes.

### Step 2: Get the agent's info

\\\`\\\`\\\`
read_file("/agent/SOUL.md")
\\\`\\\`\\\`

You need the agent's name, phone, email, and agency for the contact card.

### Step 3: Research the neighborhood

\\\`\\\`\\\`
web_search({ query: "{address} nearby MRT schools amenities" })
\\\`\\\`\\\`

Get: nearest MRT + walk time, nearby schools (2-3), shopping, parks, key selling points.

### Step 4: Get recent transactions (optional but valuable)

\\\`\\\`\\\`
web_search({ query: "{project name} recent transactions {year}" })
\\\`\\\`\\\`

or

\\\`\\\`\\\`
browser_scrape({ url: "https://edgeprop.sg/...", extract: "transactions" })
\\\`\\\`\\\`

Recent comparable sales add credibility to the page.

### Step 5: Get listing photos

If CRM has photo URLs, download them:

\\\`\\\`\\\`
fetch_url({ url: "{photo URL}" })
\\\`\\\`\\\`

Aim for 4-8 photos. If no photos in CRM, ask the user to share some.

### Step 6: Hand off to coding agent

Call publish_artifact with ALL gathered data:

\\\`\\\`\\\`
publish_artifact({
  task: "Build a property showcase page for {address}. Include hero with best photo, photo gallery, property details, neighborhood map with {MRT + schools}, recent transactions table, and agent contact card for {agent name}.",
  propertyData: {
    address, price, beds, sqft, tenure, floor,
    agent: { name, phone, email, agency },
    neighborhood: { mrt, schools, amenities },
    transactions: [ ... ],
  },
  photoUrls: ["url1", "url2", ...]
})
\\\`\\\`\\\`

**IMPORTANT:**
- Gather ALL data BEFORE calling publish_artifact
- The sandbox cannot access CRM, memory, or do web searches
- Include the agent's contact details — the showcase needs a CTA
- Include neighborhood data — it's a key selling point

## After the page is live

The tool returns a live preview URL. Present it to the user with a summary of what's included.

For follow-ups ("swap the hero photo", "add a mortgage calculator", "make the cards bigger"), call publish_artifact again. The sandbox remembers the previous code.

When the user is happy, ask if they want to:
- **Publish permanently** — builds static HTML, uploads to a permanent URL
- **Send to a client** — use send_message with the preview or permanent link
- **Keep iterating** — the preview stays live

## Gotchas

- Don't skip the photo gathering step. A showcase page without photos is useless.
- Always include the agent's contact card. The whole point is lead generation.
- If neighborhood data is sparse, say so rather than making things up.
- If no frontend-design skill exists yet, the default template (dark + gold luxury) applies. Suggest the user set up brand preferences if they want a custom look.
`,
```

---

## Task 3: Write the `market-report` outer skill

**Files:**
- Modify: `src/lib/runner/skills/skill-templates.ts`

**Step 1: Add to DEFAULT_SKILL_SLUGS**

Add `"market-report"` to the array.

**Step 2: Write the skill content**

```typescript
"market-report": `---
name: market-report
description: "Generate a market analysis report with transaction trends, price movements, and area comparisons. Produces an Excel workbook with charts and data tables. Trigger with 'market report', 'area analysis', 'how is the market in [area]', 'transaction trends for [project]'."
---

# Market Report

Produce a data-driven market analysis as an Excel workbook with charts.

## Workflow

### Step 1: Clarify scope

Ask the user (or infer from context):
- Which area, district, or project?
- What time period? (default: last 12 months)
- Any specific metrics? (price psf trends, volume, rental yields)

### Step 2: Gather transaction data

\\\`\\\`\\\`
browser_scrape({ url: "https://edgeprop.sg/...", extract: "transactions" })
\\\`\\\`\\\`

or

\\\`\\\`\\\`
web_search({ query: "{area} property transactions {year} price trends" })
\\\`\\\`\\\`

Get as many data points as possible — recent transactions, median prices, volume.

### Step 3: Get CRM context

\\\`\\\`\\\`
search_crm({ query: "{area}", table: "deals" })
\\\`\\\`\\\`

Check if the user has any active deals in the area — makes the report more relevant.

### Step 4: Read user context

\\\`\\\`\\\`
read_file("/agent/SOUL.md")
\\\`\\\`\\\`

Note the user's market specialization and client focus.

### Step 5: Hand off to coding agent

\\\`\\\`\\\`
analyze_spreadsheet({
  task: "Build a market report for {area} covering {time period}. Include: transaction volume by month, median price psf trend, price distribution, top transactions. Create charts for each. Data: {paste structured data from steps 2-3}.",
  fileUrls: []
})
\\\`\\\`\\\`

If no files were uploaded, pass the gathered data in the task description.
The coding agent will create the spreadsheet from scratch.

## Gotchas

- Web-scraped transaction data may be incomplete. Note the data source and date range in the report.
- Don't present scraped data as authoritative — frame it as "based on available public data."
- If the user wants to share this with clients, suggest converting key charts to a showcase page (property-showcase skill).
`,
```

---

## Task 4: Write the `re-analyst` inner skill (user-editable default)

This skill is seeded to user storage and guides Claude Code's financial analysis inside the Sprite. Users customize it through conversation.

**Files:**
- Modify: `src/lib/runner/skills/skill-templates.ts`

**Step 1: Add to DEFAULT_SKILL_SLUGS**

Add `"re-analyst"` to the array.

**Step 2: Write the default skill content**

This is the starting point — users will customize it by saying things like "my mortgage is 3.8%" or "I always check TDSR."

```typescript
"re-analyst": `---
name: re-analyst
description: "Your property investment analysis preferences. This skill is read by the coding agent inside the sandbox when building Excel financial models. Customize it by telling me your benchmarks, mortgage details, and analysis preferences."
type: inner
editable: true
---

# Real Estate Investment Analysis Preferences

These preferences guide how financial models are built for you.
Edit this anytime by telling me your updated preferences.

## Benchmarks

- Minimum net rental yield: 2.5%
- REIT comparison benchmark: 5% (for opportunity cost analysis)
- Risk-free rate: 3.0% (SGS 10-year bond)

## Mortgage Assumptions

- Default mortgage rate: 3.8% (fixed)
- Default LTV: 75%
- Default loan tenure: 25 years
- Always check TDSR (total debt servicing ratio, max 55%)

## Analysis Preferences

- Always show: gross yield, net yield, cash-on-cash return
- Always include sensitivity table for mortgage rates (±1% in 0.25% steps)
- Compare against REIT benchmark in summary
- Show monthly cash flow breakdown (rental income vs mortgage + expenses)
- Expense assumptions: maintenance $200/mo, property tax (based on AV), insurance $30/mo

## SG-Specific Rules

- Check ABSD applicability (citizen vs PR vs foreigner, property count)
- Check BSD (buyer's stamp duty) — standard progressive rates
- Note tenure risk for 99-year leasehold (remaining years matters)
- Freehold premium: flag if price premium > 20% vs similar leasehold

## Output Format

- Blue text for editable inputs, black for formulas
- Always use Excel FORMULAS, not hardcoded Python values
- Include assumptions sheet as first tab
- Run formula verification (recalc.py) before returning

## References

See /skills/re-analyst/references/ for:
- SG property tax rates and ABSD tables
- Yield benchmark history
- Mortgage calculation conventions
`,
```

---

## Task 5: Write the `frontend-design` inner skill (user-editable default)

**Files:**
- Modify: `src/lib/runner/skills/skill-templates.ts`

**Step 1: Add to DEFAULT_SKILL_SLUGS**

Add `"frontend-design"` to the array.

**Step 2: Write the default skill content**

```typescript
"frontend-design": `---
name: frontend-design
description: "Your brand and design preferences for generated web pages (showcase pages, pitch pages, etc.). This skill is read by the coding agent inside the sandbox. Customize it by telling me your brand colors, typography, and layout preferences."
type: inner
editable: true
---

# Design & Brand Preferences

These preferences guide how web pages are designed for you.
Edit anytime by telling me your updated brand or design preferences.

## Brand

- Agent name: (from SOUL.md)
- Agency: (from SOUL.md)
- Logo URL: (none set — tell me your logo URL to add it)
- Brand color: #C8A96E (warm gold — default luxury accent)

## Visual Style

- Background: dark (slate/charcoal gradients)
- Accent color: gold/warm metallic
- Typography: serif headings (Playfair Display), sans body (Inter)
- Aesthetic: luxury, minimal, generous whitespace
- Photos: full-bleed hero, CSS grid gallery with hover effects

## Always Include

- Hero section with best listing photo + address + price overlay
- Photo gallery (grid layout, lightbox on click)
- Property details (beds, sqft, tenure, floor, price)
- Agent contact card with photo, phone, email, agency
- Call-to-action button ("Schedule a Viewing" or "Contact Agent")

## Include When Available

- Neighborhood map with MRT, schools, amenities
- Recent comparable transactions table
- Mortgage calculator widget (interactive, default to user's mortgage rate)

## Never Include

- Generic stock photos
- Competitor agent information
- Unverified claims about property value appreciation

## Technical

- Tailwind CSS v4 for all styling
- React 18 components
- Single-page layout (no routing)
- Mobile-responsive (test at 375px width)
- Accessible: proper alt text, contrast ratios, semantic HTML
`,
```

---

## Task 6: Write reference files for `re-analyst`

Domain knowledge files that Claude Code can reference inside the Sprite. These are seeded alongside the re-analyst SKILL.md.

**Files:**
- Create: `docs/product/references/re-analyst-domain-knowledge.md` — source material (committed to repo, used to seed storage)

**Step 1: Write SG property tax reference**

This gets seeded to `{clientId}/skills/re-analyst/references/sg-property-taxes.md`:

```markdown
# Singapore Property Tax & Stamp Duty Reference

## Buyer's Stamp Duty (BSD)
| Purchase Price Bracket | Rate |
|---|---|
| First $180,000 | 1% |
| Next $180,000 | 2% |
| Next $640,000 | 3% |
| Next $500,000 | 4% |
| Next $1,500,000 | 5% |
| Above $3,000,000 | 6% |

## Additional Buyer's Stamp Duty (ABSD) — from Apr 2023
| Buyer Profile | 1st Property | 2nd Property | 3rd+ Property |
|---|---|---|---|
| SG Citizen | 0% | 20% | 30% |
| SG PR | 5% | 30% | 35% |
| Foreigner | 60% | 60% | 60% |
| Entity | 65% | 65% | 65% |

## Total Debt Servicing Ratio (TDSR)
- Max 55% of gross monthly income
- Applies to all property loans from financial institutions
- Stress-test rate: 4% or actual rate, whichever is higher (for variable rate loans)

## Property Tax (Annual)
Based on Annual Value (AV) — estimated annual rent

**Owner-Occupied:**
| AV Bracket | Rate |
|---|---|
| First $8,000 | 0% |
| Next $22,000 | 4% |
| Next $10,000 | 6% |
| Next $15,000 | 8% |
| Next $15,000 | 10% |
| Next $15,000 | 12% |
| Next $15,000 | 14% |
| Above $100,000 | 16% |

**Non-Owner-Occupied (Investment):**
| AV Bracket | Rate |
|---|---|
| First $30,000 | 12% |
| Next $15,000 | 20% |
| Next $15,000 | 28% |
| Above $60,000 | 36% |

## Lease Decay
- 99-year leasehold: value typically starts declining noticeably after 40 years remaining
- Rule of thumb: remaining lease < 60 years = significant financing restrictions
- Banks may reduce LTV or refuse loans for leases < 30 years remaining

> Note: Rates current as of 2025. Verify before use in client-facing materials.
```

**Step 2: Write yield benchmarks reference**

Seeded to `{clientId}/skills/re-analyst/references/yield-benchmarks.md`:

```markdown
# Yield & Return Benchmarks (Singapore)

## REIT Benchmarks (as of 2025)
| REIT Category | Avg Distribution Yield |
|---|---|
| Retail REITs | 5.5-6.5% |
| Office REITs | 5.0-6.0% |
| Industrial REITs | 6.0-7.5% |
| Hospitality REITs | 5.0-7.0% |
| Healthcare REITs | 5.5-6.5% |
| S-REIT Index (overall) | ~5.5% |

## Residential Rental Yields
| District | Typical Gross Yield |
|---|---|
| Core Central (D1, D2, D6, D9, D10, D11) | 2.5-3.5% |
| Rest of Central (D3-5, D7-8, D12-15) | 3.0-4.0% |
| Outside Central (D16-28) | 3.5-4.5% |

## Risk-Free Rate
- SGS 10-year bond: ~3.0% (2025)
- CPF OA rate: 2.5%
- Fixed deposit (12-month): ~2.5-3.0%

## Common Thresholds
- Net yield > 2.5% = generally acceptable
- Net yield > 3.5% = strong for SG residential
- Cash-on-cash > 5% = competitive with REITs
- TDSR < 45% = comfortable buffer
- TDSR 45-55% = tight but acceptable

> These are reference benchmarks only. Actual yields depend on specific property,
> tenant quality, vacancy assumptions, and market conditions.
```

---

## Task 7: Update `bootstrapSkills()` to seed inner skills with references

The inner skills (`re-analyst`, `frontend-design`) need their reference files seeded alongside the SKILL.md. Update the bootstrap logic.

**Files:**
- Modify: `src/lib/runner/skills/skill-bootstrap.ts`

**Step 1: Add reference file content to `skill-templates.ts`**

Add a new export for reference files:

```typescript
export const INNER_SKILL_REFERENCES: Record<string, Record<string, string>> = {
  "re-analyst": {
    "references/sg-property-taxes.md": SG_PROPERTY_TAXES_CONTENT,
    "references/yield-benchmarks.md": YIELD_BENCHMARKS_CONTENT,
  },
  // frontend-design has no reference files by default
};
```

Where `SG_PROPERTY_TAXES_CONTENT` and `YIELD_BENCHMARKS_CONTENT` are the markdown strings from Task 6.

**Step 2: Update `bootstrapSkills()` to write reference files**

After writing a SKILL.md, check `INNER_SKILL_REFERENCES[slug]` and write any reference files:

```typescript
const refs = INNER_SKILL_REFERENCES[slug];
if (refs) {
  for (const [refPath, content] of Object.entries(refs)) {
    const fullPath = `skills/${slug}/${refPath}`;
    // Check if exists first (don't overwrite user edits)
    const { data: existing } = await storage.from(BUCKET).download(storagePath(clientId, fullPath));
    if (!existing) {
      await storage.from(BUCKET).upload(storagePath(clientId, fullPath), content);
    }
  }
}
```

---

## Task 8: Update system prompt for sandbox skill guidance

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`

**Step 1: Add sandbox tool orchestration guidance**

In the `<custom-skills>` section of the system prompt, add a block explaining the gather→hand-off pattern:

```typescript
const SANDBOX_SKILL_GUIDANCE = `
## Sandbox Tools — Gather First, Then Hand Off

When using analyze_spreadsheet or publish_artifact, ALWAYS gather data first:
1. Search CRM for property details
2. Read SOUL.md for agent context
3. Web search for neighborhood/market data
4. Download photos if needed
5. THEN call the sandbox tool with everything gathered

The sandbox tool runs a coding agent in an isolated environment. It CANNOT access
CRM, memory, web search, or any other platform tools. Everything it needs must be
passed in via the tool call parameters.

After the sandbox tool returns, present the result to the user (download link or
preview URL) and ask if they want to iterate. Follow-up refinements use the same
sandbox — no need to re-gather data.

The coding agent inside the sandbox reads these skill files:
- /skills/re-analyst/SKILL.md — for financial analysis preferences (analyze_spreadsheet)
- /skills/frontend-design/SKILL.md — for brand/design preferences (publish_artifact)
You do NOT need to repeat those preferences in your tool call. The coding agent reads them directly.
`;
```

Add this to the system prompt when sandbox tools are available (check if the tools are registered).

---

## Task 9: Tests

**Files:**
- Create: `src/lib/runner/skills/__tests__/sandbox-skills.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { DEFAULT_SKILL_CONTENT, DEFAULT_SKILL_SLUGS, INNER_SKILL_REFERENCES } from "../skill-templates";

describe("sandbox workflow skills", () => {
  // Outer skills exist and reference the right tools
  it.each(["deal-comparison", "property-showcase", "market-report"])(
    "%s skill exists in defaults",
    (slug) => {
      expect(DEFAULT_SKILL_SLUGS).toContain(slug);
      expect(DEFAULT_SKILL_CONTENT[slug as keyof typeof DEFAULT_SKILL_CONTENT]).toBeDefined();
    },
  );

  it("deal-comparison references analyze_spreadsheet", () => {
    const content = DEFAULT_SKILL_CONTENT["deal-comparison" as keyof typeof DEFAULT_SKILL_CONTENT];
    expect(content).toContain("analyze_spreadsheet");
    expect(content).toContain("search_crm");
  });

  it("property-showcase references publish_artifact", () => {
    const content = DEFAULT_SKILL_CONTENT["property-showcase" as keyof typeof DEFAULT_SKILL_CONTENT];
    expect(content).toContain("publish_artifact");
    expect(content).toContain("search_crm");
    expect(content).toContain("web_search");
  });

  it("market-report references analyze_spreadsheet", () => {
    const content = DEFAULT_SKILL_CONTENT["market-report" as keyof typeof DEFAULT_SKILL_CONTENT];
    expect(content).toContain("analyze_spreadsheet");
    expect(content).toContain("browser_scrape");
  });

  // Inner skills exist and are marked as editable
  it.each(["re-analyst", "frontend-design"])(
    "%s inner skill exists and is editable",
    (slug) => {
      const content = DEFAULT_SKILL_CONTENT[slug as keyof typeof DEFAULT_SKILL_CONTENT];
      expect(content).toBeDefined();
      expect(content).toContain("editable: true");
    },
  );

  it("re-analyst has reference files", () => {
    const refs = INNER_SKILL_REFERENCES["re-analyst"];
    expect(refs).toBeDefined();
    expect(refs["references/sg-property-taxes.md"]).toContain("ABSD");
    expect(refs["references/yield-benchmarks.md"]).toContain("REIT");
  });

  // Skill content has valid YAML frontmatter
  it.each(DEFAULT_SKILL_SLUGS)("%s has valid frontmatter", (slug) => {
    const content = DEFAULT_SKILL_CONTENT[slug as keyof typeof DEFAULT_SKILL_CONTENT];
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("name:");
    expect(content).toContain("description:");
  });

  // Outer skills warn not to do computation in chat
  it("deal-comparison warns against chat computation", () => {
    const content = DEFAULT_SKILL_CONTENT["deal-comparison" as keyof typeof DEFAULT_SKILL_CONTENT];
    expect(content).toContain("Do NOT calculate");
  });

  // Outer skills remind to gather BEFORE calling sandbox
  it("property-showcase reminds to gather first", () => {
    const content = DEFAULT_SKILL_CONTENT["property-showcase" as keyof typeof DEFAULT_SKILL_CONTENT];
    expect(content).toContain("Gather ALL data BEFORE");
  });
});
```

Run: `npx vitest run src/lib/runner/skills/__tests__/sandbox-skills.test.ts`

---

## Task Summary

| Task | What | Depends On |
|---|---|---|
| 1 | `deal-comparison` outer skill | — |
| 2 | `property-showcase` outer skill | — |
| 3 | `market-report` outer skill | — |
| 4 | `re-analyst` inner skill (default) | — |
| 5 | `frontend-design` inner skill (default) | — |
| 6 | Reference files for re-analyst | 4 |
| 7 | Update bootstrap to seed inner skill references | 4, 5, 6 |
| 8 | System prompt sandbox guidance | 1, 2, 3 |
| 9 | Tests | 1-8 |

Tasks 1-5 are independent — can be done in any order or parallel. Task 6 depends on 4. Task 7 depends on 4+5+6. Task 8 depends on the outer skills (1-3). Task 9 validates everything.

**Expected outcome:** When a user says "compare these 3 condos" or "build me a showcase page," the runner consistently follows the right workflow: gather data from CRM/web/memory, assemble everything, then hand off to the sandbox tool. The coding agent inside the Sprite gets proper skill files and domain references to produce high-quality output.
