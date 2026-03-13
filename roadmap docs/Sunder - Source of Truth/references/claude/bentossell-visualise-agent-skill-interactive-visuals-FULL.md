# Visualise — Agent Skill for Inline Interactive Visuals

**Source:** https://github.com/bentossell/visualise
**Author:** Ben Tossell (built by [factory.ai](http://factory.ai/))
**Date:** Mar 12, 2026
**Tags:** agents, generative-ui, interactive-charts, agent-skills, svg, chart.js, reverse-engineering, streaming

---

## What It Is

An open-source "Agent Skill" that teaches coding agents to render rich interactive visuals — SVG diagrams, HTML widgets, charts, and explainers — directly inline in conversations. Another reverse-engineering of Claude's generative UI system (see also: [Michael Livshits' approach](michael-livshits-reverse-engineering-claude-generative-ui-FULL.md)), but packaged as a reusable, client-agnostic skill.

Instead of describing a flowchart or pasting ASCII art, the agent generates a real interactive visual. Diagrams you can click, sliders you can drag, charts that update live.

## How It Differs From the Livshits Approach

| | Livshits (Pi terminal extension) | Tossell (Visualise skill) |
|--|--|--|
| **Packaging** | Pi extension (runtime-specific) | Agent Skill (client-agnostic) |
| **Rendering** | Terminal-native via Pi | `visualizer` code fence → sandboxed iframe |
| **Activation** | `show_widget` tool call | Automatic — triggered by verbs like "visualize", "diagram", "show me" |
| **Progressive disclosure** | `read_me` tool with modules param | Same pattern — SKILL.md loads first (~100 tokens), then references on demand |
| **Design system** | Extracted from Claude's internal system | Custom design system (CSS vars, 9 color ramps, light/dark) |
| **Scope** | Focused on reverse-engineering Claude's exact implementation | Broader — full component library, diagram taxonomy, chart patterns |

## Architecture: Progressive Disclosure

The skill uses progressive disclosure to stay lean:

1. **At startup**: Only skill name + description loaded (~100 tokens)
2. **When activated**: Agent reads `SKILL.md` (main instructions)
3. **Then pulls only needed references**:
   - `design-system.md` — CSS variables, color ramps, typography
   - `components.md` — interactive explainers, comparisons, cards, steppers
   - `diagrams.md` — flowcharts, structural, illustrative diagrams
   - `charts.md` — Chart.js and data viz patterns

## Output Format

Output is raw HTML/SVG fragments wrapped in a `visualizer` code fence:

````
```visualizer
<svg width="100%" viewBox="0 0 680 400">
  ...
</svg>
```
````

The client strips the fence and injects content into a sandboxed iframe with theme CSS variables prepended. Two modes:
- **SVG mode**: Output starts with `<svg>`. Client auto-wraps in card. Best for static diagrams.
- **HTML mode**: Raw HTML fragment. Best for interactive content (sliders, tabs, charts). Can embed `<svg>` inside.

## Streaming Constraints

Because output streams token-by-token into the DOM:

1. `<style>` first (kept minimal — inline styles preferred)
2. Visible HTML/SVG content next (user sees it building)
3. `<script>` last (executes only after streaming completes)

Key restrictions:
- No gradients, drop shadows, blur, glow — they flash during DOM diffs
- No `display:none` or hidden content — streams invisibly
- No comments — waste tokens, break streaming
- No tabs/carousels that start hidden — show stacked, add interactivity post-stream via JS

## Design System

### CSS Variables (Injected by Client)

All visuals use CSS variables that auto-adapt to light/dark mode:
- Backgrounds: `--color-background-primary` / `-secondary` / `-tertiary` + semantic
- Text: `--color-text-primary` / `-secondary` / `-tertiary` + semantic
- Borders: `--color-border-tertiary` (0.15 alpha) / `-secondary` (0.3) / `-primary` (0.4)
- Typography: `--font-sans` / `--font-serif` / `--font-mono`
- Radii: `--border-radius-md` (8px) / `-lg` (12px) / `-xl` (16px)

### 9 Color Ramps (7 stops each)

| Name | 50 | 400 | 600 | 900 |
|------|-----|-----|-----|-----|
| purple | #EEEDFE | #7F77DD | #534AB7 | #26215C |
| teal | #E1F5EE | #1D9E75 | #0F6E56 | #04342C |
| coral | #FAECE7 | #D85A30 | #993C1D | #4A1B0C |
| blue | #E6F1FB | #378ADD | #185FA5 | #042C53 |
| amber | #FAEEDA | #BA7517 | #854F0B | #412402 |
| + pink, gray, green, red | | | | |

Color encodes meaning, not sequence. 2-3 ramps per diagram. Reserve blue/green/amber/red for semantic meaning.

### SVG Classes (Pre-built)

- Text: `.t` (14px), `.ts` (12px secondary), `.th` (14px bold)
- Shapes: `.box` (neutral rect), `.node` (clickable + hover), `.arr` (arrow line), `.leader` (dashed)
- Colors: `.c-purple`, `.c-teal`, `.c-coral`, `.c-pink`, `.c-gray`, `.c-blue`, `.c-green`, `.c-amber`, `.c-red`

Color classes handle light/dark mode automatically via `@media (prefers-color-scheme: dark)`.

## Diagram Taxonomy

Three families, routed by verb not noun:

| User says | Type | What to build |
|-----------|------|---------------|
| "how does X work" | **Illustrative** | Spatial metaphor showing the mechanism |
| "what are the components of X" | **Structural** | Labelled boxes showing containment |
| "walk me through the steps" | **Flowchart** | Sequential boxes and arrows |
| "compare X vs Y" | **Comparison layout** | Side-by-side cards with metrics |
| "show me the data" | **Chart** | Chart.js or inline data viz |
| "explain X" (spatial concept) | **Interactive explainer** | Sliders, controls, live state |

Key principle: *Default to illustrative for "how does X work" — don't retreat to a flowchart because it feels safer.*

## Charts

Uses Chart.js 4.x from CDN (`cdnjs.cloudflare.com`). Key patterns:

- Canvas wrapped in container with explicit height + `position: relative`
- `responsive: true`, `maintainAspectRatio: false`
- CSS variables for text/border colors — never hardcode grays
- Dataset colors from ramp 400/600 stops
- Chart type selection: bar (categories), line (time series), doughnut (parts of whole), scatter (two variables)
- D3.js available for complex custom viz (force graphs, maps, treemaps) but Chart.js preferred for standard charts
- Also supports inline SVG charts for simple visualizations that stream better (horizontal bars, sparklines)

## UI Components

- **Metric cards** — summary numbers in secondary bg grid
- **Interactive explainers** — sliders, buttons, live state (no card wrapper)
- **Comparison layouts** — side-by-side cards, recommended option gets 2px accent border
- **Data records** — single raised card with avatar + fields
- **Steppers** — for cyclic processes (linear layout with prev/next, not ring diagrams)
- **Mockup presentation** — contained mockups in secondary bg surface

## Client Implementation

The skill is client-agnostic. Output is HTML/SVG in a `visualizer` code fence. The client needs:

1. **Detect** `visualizer` code fences in message content
2. **Render** in sandboxed iframe with theme CSS + SVG classes injected
3. **Auto-size** via ResizeObserver
4. **Bridge** `sendPrompt(text)` from iframe to chat (makes visuals conversational)
5. **Stream** by writing tokens incrementally to iframe (`doc.write()` left open)

Iframe sandbox rules:
- No localStorage/sessionStorage — state is in-memory only
- No `position: fixed` — iframe auto-sizes to content
- No external fetches — CSP blocks API calls
- CDN allowlist: `cdnjs.cloudflare.com`, `esm.sh`, `cdn.jsdelivr.net`, `unpkg.com`

## The `sendPrompt` Bridge

A global `sendPrompt(text)` function inside the iframe sends a message to chat as if the user typed it. Makes visuals conversational — clicking a node in a diagram triggers follow-up explanation from the model.

Rule: Use `sendPrompt` when the user's next step benefits from the model thinking. Handle filtering, sorting, toggling, and calculations in local JS.

## Relevance to Sunder

This is the second independent reverse-engineering of Claude's generative UI system (after Livshits). Key takeaways for Sunder's json-render/inline-mode work:

1. **Progressive disclosure is the pattern** — both implementations gate design docs behind a read-first mechanism to keep initial context small
2. **Code fence detection** — `visualizer` fence is the contract between model and client, similar to our json-render approach
3. **Streaming-first constraints** — the DOM-diff flash problem is real and dictates no gradients/shadows/hidden content
4. **sendPrompt bridge** — conversational visuals where clicking triggers follow-up is a powerful pattern for agent UIs
5. **Design system via CSS variables** — theme injection into sandboxed iframes handles light/dark automatically
6. **Client-agnostic skill packaging** — the skill teaches the model *what to generate*, the client handles rendering
