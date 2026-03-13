# Reverse-engineering Claude's generative UI - then building it for the terminal

**Source:** https://michaellivs.com/blog/reverse-engineering-claude-generative-ui
**Code:** https://github.com/Michaelliv/pi-generative-ui/tree/main/.pi/extensions/generative-ui
**Author:** Michael Livshits
**Date:** Mar 13, 2026
**Tags:** agents, generative-ui, claude, reverse-engineering, pi, extensions, streaming

---

## The Discovery

Anthropic announced generative UI for Claude. Interactive widgets - sliders, charts, animations - rendered inline in claude.ai conversations. Not images. Not code blocks. Living HTML applications with JavaScript running inside the chat.

## Part 1: Interrogating Claude About Its Own UI

### The Tool, Not the Markdown

Claude uses a tool call (`show_widget`), not markdown output. The HTML is a parameter payload, not streamed text:

```json
{
  "i_have_seen_read_me": true,
  "title": "snake_case_identifier",
  "loading_messages": ["First loading message", "Second loading message"],
  "widget_code": "...styles...\n...html content...\n..."
}
```

Four parameters:

- **i_have_seen_read_me** - Gate function. Claude must call a `read_me` tool first to load design guidelines before it can use `show_widget`. Compile-time check for documentation compliance.
- **title** - A snake_case identifier for the widget.
- **loading_messages** - 1-4 short strings shown while the widget renders.
- **widget_code** - Raw HTML fragment. No `<!DOCTYPE>`, no `<html>`, no `<head>`, no `<body>`. Just content.

### The read_me Pattern - Progressive Disclosure

Before Claude can call `show_widget`, it must call `read_me` with a modules parameter:

```json
{
  "modules": ["interactive", "chart"]
}
```

Available modules: `diagram`, `mockup`, `interactive`, `chart`, `art`.

Each module returns different design guidelines. It's a lazy documentation system - instead of dumping the entire design system into context upfront, it loads only the relevant subset on demand. Progressive disclosure applied to the model's own instructions.

### Not an Iframe - Live DOM Injection

The widget renders live as Claude streams its response. This is only possible with direct DOM injection into the parent page, not a sandboxed iframe:

- `var(--color-text-primary)` resolves correctly because it's the same document, same cascade
- `sendPrompt()` works - a function on the parent page, accessible to injected code
- Background is transparent - no iframe container
- No loading flash - no iframe border, no scrollbar

The "sandbox" is almost certainly just a Content Security Policy restricting CDN domains:

- cdnjs.cloudflare.com
- cdn.jsdelivr.net
- unpkg.com
- esm.sh

### How It Differs from Artifacts

| | Artifacts | Visualizer (show_widget) |
|---|---|---|
| Purpose | Deliverables - files you keep, download, share | Inline enhancements - part of the conversation flow |
| Display | Side panel with download button | Inline in the chat, transparent background |
| Libraries | Closed set of pre-bundled libraries | Any library from CDN allowlist, downloaded live |
| Persistence | Survives across sessions | Ephemeral, tied to the message |
| Trigger | "Build me a calculator" (deliverable language) | "Show me how compound interest works" (explanatory language) |

### The Streaming Architecture

1. LLM starts generating the `show_widget` tool call
2. The `widget_code` parameter streams token by token as JSON string chunks
3. The client does incremental HTML parsing on the partial content
4. DOM nodes are inserted into the page in real-time via innerHTML or similar
5. CSS variables resolve immediately (same document)
6. `style` blocks and HTML structure render as they arrive
7. `script` tags execute once streaming completes (scripts go last)
8. CDN libraries load asynchronously; charts/interactivity activate after scripts run

Design guideline: "Structure content: style (short) → content HTML → script last." Content renders progressively; scripts activate at the end.

## Part 2: Building It for Pi

### Enter Glimpse

Glimpse - a native macOS micro-UI library. Opens a WKWebView window in under 50ms. Swift binary with a Node.js wrapper. No Electron, no browser, no runtime dependencies.

Key capabilities:

- **Native WKWebView** - full browser engine (CSS, JS, Canvas, CDN libraries)
- **Sub-50ms startup** - feels instant
- **Bidirectional JSON** - `window.glimpse.send(data)` sends data from the page back to Node.js
- **Window modes** - floating, frameless, transparent, click-through, follow-cursor
- **setHTML()** - replace page content at runtime
- **send(js)** - evaluate JavaScript in the WebView

### The Extension Architecture

Pi extensions are TypeScript modules that can register custom tools, subscribe to lifecycle events, and render custom TUI components:

```
LLM generates show_widget tool call
            │
            ▼
   ┌───────────────────┐
   │ message_update    │──── streaming: intercept partial tool call JSON
   │    event          │     feed partial HTML as tokens arrive
   │                   │
            │
            ▼
   ┌───────────────────┐
   │  tool_call        │──── complete: final widget_code available
   │    event          │
   └────────┬──────────┘
            │
            ▼
   ┌───────────────────┐
   │   execute()       │──── reuse streaming window or open fresh
   │                   │     wait for user interaction or window close
   └────────┬──────────┘     return interaction data as tool result
            │
            ▼
   ┌───────────────────┐
   │  renderCall       │──── TUI: "show_widget compound interest 800×600"
   │  renderResult     │──── TUI: "✓ compound interest 800×600"
   └───────────────────┘
```

### Two Tools

**visualize_read_me** - Returns design guidelines for the requested modules:

```typescript
pi.registerTool({
  name: "visualize_read_me",
  parameters: Type.Object({
    modules: Type.Array(StringEnum(AVAILABLE_MODULES)),
  }),
  async execute(_toolCallId, params) {
    return {
      content: [{ type: "text", text: getGuidelines(params.modules) }],
      details: { modules: params.modules },
    };
  },
});
```

**show_widget** - Takes HTML/SVG code, opens a native macOS window via Glimpse, returns user interaction data:

```typescript
pi.registerTool({
  name: "show_widget",
  parameters: Type.Object({
    i_have_seen_read_me: Type.Boolean(),
    title: Type.String(),
    widget_code: Type.String(),
    width: Type.Optional(Type.Number()),
    height: Type.Optional(Type.Number()),
    floating: Type.Optional(Type.Boolean()),
  }),
  async execute(_toolCallId, params, signal) {
    const { open } = await import(GLIMPSE_PATH);
    const win = open(wrapHTML(params.widget_code), {
      width: params.width ?? 800,
      height: params.height ?? 600,
      title: params.title.replace(/_/g, " "),
    });

    return new Promise((resolve) => {
      win.on("message", (data) => {
        resolve({ content: [{ type: "text", text: `User data: ${JSON.stringify(data)}` }] });
      });
      win.on("closed", () => {
        resolve({ content: [{ type: "text", text: "Window closed." }] });
      });
    });
  },
});
```

## Part 3: The Streaming Challenge

### Attempt 1: setHTML() on Every Delta

Replace entire document on every token. Result: Worked but extremely choppy — full page reflow, loss of scroll position, flash of unstyled content every ~80ms.

### Attempt 2: Shell Page + innerHTML via JS Eval

Open window once with shell HTML containing `<div id="root">`, update innerHTML on each delta. Result: Better but still choppy — innerHTML replaces all child nodes.

### Attempt 3: Naive DOM Appending

Track previous content length, only append new child nodes. Result: Failed — browser auto-closes unclosed HTML tags during partial parsing, creating fundamentally different tree structures.

### Attempt 4: morphdom - DOM Diffing (The Solution)

Introduced morphdom for fast DOM diffing. Compares old and new DOM trees, applies minimal patches:

```javascript
morphdom(root, target, {
  onBeforeElUpdated: function(from, to) {
    // Skip if identical — existing content stays untouched
    return !from.isEqualNode(to);
  },
  onNodeAdded: function(node) {
    // New nodes get fade-in animation
    node.style.animation = '_fadeIn 0.3s ease both';
    return node;
  }
});
```

Loading race condition solved with pending buffer:

```javascript
window._morphReady = false;
window._pending = null;

window._setContent = function(html) {
  if (!window._morphReady) { window._pending = html; return; }
  // ... morphdom diffing
};
```

Script execution (innerHTML doesn't execute script tags):

```javascript
window._runScripts = function() {
  document.querySelectorAll('#root script').forEach(function(old) {
    var s = document.createElement('script');
    if (old.src) { s.src = old.src; }
    else { s.textContent = old.textContent; }
    old.parentNode.replaceChild(s, old);
  });
};
```

### The Complete Streaming Flow

```
toolcall_start (show_widget detected)
  │
  ├── streaming state initialized
  │
  ▼
toolcall_delta (repeated, every ~token)
  │
  ├── read partial.content[index].arguments.widget_code
  ├── debounce 150ms
  ├── first time: open Glimpse window with shellHTML()
  │   └── win.send(`_setContent('${escapedHTML}')`)
  │   └── morphdom diffs old vs new DOM
  │   └── new nodes get _fadeIn animation
  │   └── unchanged nodes stay untouched
  │
  ▼
toolcall_end
  │
  ├── final _setContent with complete HTML
  ├── _runScripts() activates script tags
  │   └── Chart.js loads from CDN
  │   └── charts render
  │   └── event listeners attach
  │
  ▼
execute() called
  │
  ├── reuses existing streaming window (no double-open)
  ├── waits for:
  │   ├── window.glimpse.send(data) → user interaction
  │   ├── window close → user dismissed
  │   └── 120s timeout → auto-resolve
  ├── returns tool result with interaction data
```

### String Escaping

```typescript
function escapeJS(s: string) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/<\/script>/gi, '<\\/script>');
}
```

## Part 4: Extracting the Design Guidelines - Verbatim

Extracted from browser devtools network requests. The `read_me` tool result contains Anthropic's actual design guidelines verbatim.

### Module System

| Modules requested | Response size | Unique sections included |
|---|---|---|
| `["interactive"]` | 19K | Core + UI components + Color palette |
| `["chart"]` | 22K | Core + UI components + Color palette + Charts (Chart.js) |
| `["mockup"]` | 19K | Core + UI components + Color palette |
| `["art"]` | 17K | Core + SVG setup + Art and illustration |
| `["diagram"]` | 59K | Core + Color palette + SVG setup + Diagram types |

Every response shares the same core (philosophy, streaming rules, typography, CSS variables, sendPrompt() docs). Each module appends its specific sections. 10 unique sections that can be recombined to reproduce any module response exactly.

### Design System Highlights

**Core rules:**
- Streaming-first architecture: style → HTML → script last
- No gradients, shadows, blur - they flash during streaming DOM diffs
- No `<!-- comments -->` - waste tokens and break streaming
- Two font weights only (400, 500) - never 600 or 700
- Sentence case everywhere, never Title Case or ALL CAPS
- CSS variables for all colors
- Dark mode is mandatory
- CDN allowlist: cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com, esm.sh

**Color palette** - Nine color ramps, each with 7 stops from lightest to darkest:
```
Purple: #EEEDFE → #CECBF6 → #AFA9EC → #7F77DD → #534AB7 → #3C3489 → #26215C
Teal:   #E1F5EE → #9FE1CB → #5DCAA5 → #1D9E75 → #0F6E56 → #085041 → #04342C
Coral:  #FAECE7 → #F5C4B3 → #F0997B → #D85A30 → #993C1D → #712B13 → #4A1B0C
```

Rules: color encodes meaning, not sequence. 2-3 ramps per widget max. Text on colored backgrounds must use the 800/900 stop from the same ramp - never black.

**SVG setup** - ViewBox safety checklist, font width calibration table, pre-built CSS classes, arrow markers with context-stroke.

**Diagram types** - Decision framework: route on the verb, not the noun. Complexity budgets: ≤5 words per subtitle, ≤4 boxes per horizontal tier.

**UI components** - Cards (white bg, 0.5px border, radius-lg), buttons with hover/active states, metric cards, skeleton loading patterns.

**Charts** - Chart.js-specific: canvas wrapper sizing, custom HTML legends, number formatting (`-$5M` not `$-5M`).

### Guidelines Implementation

```typescript
export function getGuidelines(modules: string[]): string {
  let content = CORE;
  const seen = new Set<string>();
  for (const mod of modules) {
    const sections = MODULE_SECTIONS[mod];
    if (!sections) continue;
    for (const section of sections) {
      if (!seen.has(section)) {
        seen.add(section);
        content += "\n\n\n" + section;
      }
    }
  }
  return content + "\n";
}
```

## Part 5: Key Takeaways

1. **Claude's Generative UI is simpler than it looks** — A tool call returning HTML, injected into the DOM with incremental parsing. The sophistication is in the design guidelines.

2. **The read_me pattern is brilliant** — Lazy-loading documentation into the model's context on demand. Instead of a massive system prompt, load specialized knowledge only when needed.

3. **DOM diffing solves streaming smoothness** — Can't innerHTML on every token (flashes). Can't naively append (partial HTML creates unpredictable trees). Need DOM diffing (morphdom) for minimal patches + animate only new nodes.

4. **Glimpse makes terminal agents visual** — Sub-50ms WKWebView windows with bidirectional JSON communication bridge terminal and browser.

5. **Normalized streaming events are gold** — Pi's unified `toolcall_start` / `toolcall_delta` / `toolcall_end` with progressively-parsed arguments works across all providers.

## Project Structure

```
pi-generative-ui/
├── .pi/
│   └── extensions/
│       └── generative-ui/
│           ├── index.ts        # Extension entry point (~350 lines)
│           └── guidelines.ts   # Modular design guidelines
├── node_modules/
│   └── glimpseui/             # Native macOS WKWebView
├── package.json
└── BLOG.md
```

## What's Next

- **Dark mode adaptation** — Glimpse provides `appearance.darkMode` on the ready event
- **sendPrompt() equivalent** — Widget-to-chat communication via `window.glimpse.send({ type: 'prompt', text: '...' })`
- **Persistent widgets** — Keep window open across multiple turns, pushing live updates
- **Widget gallery** — Pre-built templates for common patterns
