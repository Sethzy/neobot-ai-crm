# Claude Code Spinner / Streaming Status System — Reference

> **Source repo:** `/Users/sethlim/Documents/cc-src` (extracted from the public Claude Code source map)
> **Purpose:** Reference for porting CC's streaming status indicator (animated `✻` + rotating verb + thinking shimmer + stall detection + token counter) into Sunder's web chat.
> **Default policy:** Copy CC verbatim. Drift only where the host environment (browser vs terminal/Ink) makes verbatim impossible. Every drift below has a reason; if your reason isn't listed, default to verbatim.

---

## 1. Why this reference exists

CC's loading indicator is the most over-engineered streaming spinner in production. It:

- Runs at a synchronized 50ms tick across every animation in the UI (one shared clock).
- Encodes 5 distinct stream modes (`thinking | requesting | responding | tool-input | tool-use`).
- Picks one of 204 random verbs once per turn ("Cogitating…", "Boondoggling…").
- Smoothly animates a token counter (interpolated, not jumpy).
- Detects stalls: after 3s of no new tokens, the spinner glyph and message fade to red over 2s.
- Shows a "thinking" → "thought for Ns" transition with a 2s minimum-display floor.
- Pulses a sine-wave shimmer over "thinking" text after a 3s warmup.
- Pauses every animation when the row scrolls offscreen (terminal viewport detection).
- Has a reduced-motion fallback for every animated element.
- Splits the parent (re-renders ~25×/turn on prop changes) from the child (re-renders ~383×/turn on the 50ms clock) to keep the hot loop tight.

We do not need to invent any of this. We need to port it.

---

## 2. Files to copy from `cc-src`

These are the **authoritative source files**. Read them in this order before writing any Sunder code.

| # | CC file | What it contains | Lines | Sunder destination |
|---|---|---|---|---|
| 1 | `constants/spinnerVerbs.ts` | The 204 verb list + `getSpinnerVerbs()` accessor | 205 | `src/lib/chat/spinner-verbs.ts` |
| 2 | `constants/figures.ts` | `TEARDROP_ASTERISK = '✻'` + other glyphs | 46 | `src/lib/chat/spinner-figures.ts` |
| 3 | `components/Spinner/utils.ts` | `getDefaultCharacters()` (spinner frames), `interpolateColor`, `parseRGB`, `toRGBColor`, `hueToRgb` | 85 | `src/components/chat/spinner/utils.ts` |
| 4 | `components/Spinner/types.ts` *(not in dump — inferred)* | `type SpinnerMode = 'thinking' \| 'requesting' \| 'responding' \| 'tool-input' \| 'tool-use'` | — | `src/components/chat/spinner/types.ts` |
| 5 | `components/Spinner/SpinnerGlyph.tsx` | The animated `✻` cycler with stall + reduced-motion branches | 79 | `src/components/chat/spinner/spinner-glyph.tsx` |
| 6 | `components/Spinner/GlimmerMessage.tsx` | The verb text with sweeping shimmer highlight + tool-use flash + stall red | ~340 | `src/components/chat/spinner/glimmer-message.tsx` |
| 7 | `components/Spinner/useShimmerAnimation.ts` | Position calculator for the shimmer highlight (`glimmerIndex`) | 32 | `src/components/chat/spinner/use-shimmer-animation.ts` |
| 8 | `components/Spinner/useStalledAnimation.ts` | Stall detection (>3s no tokens → fade-to-red) with smoothing | 76 | `src/components/chat/spinner/use-stalled-animation.ts` |
| 9 | `components/Spinner/SpinnerAnimationRow.tsx` | The 50ms-loop child: composes glyph + message + thinking shimmer + token counter + elapsed timer | ~320 | `src/components/chat/spinner/spinner-animation-row.tsx` |
| 10 | `components/Spinner.tsx` (the `SpinnerWithVerb` export) | The slow parent: picks verb, owns thinking-state effect, gates layout | 803 (only 1–301 relevant) | `src/components/chat/spinner/spinner-with-verb.tsx` |
| 11 | `components/LogoV2/AnimatedAsterisk.tsx` | The 3s HSL hue sweep on `✻` (used on welcome screen + idle) | 49 | `src/components/chat/spinner/animated-asterisk.tsx` |
| 12 | `ink/components/ClockContext.tsx` | Shared 50ms tick clock (subscribers + tickTime + focus pause) | 112 | `src/components/chat/spinner/clock-context.tsx` |
| 13 | `ink/hooks/use-animation-frame.ts` | `useAnimationFrame(intervalMs \| null)` consumer hook | 57 | `src/components/chat/spinner/use-animation-frame.ts` |
| 14 | `utils/messages.ts` (lines 2939–3094: `handleMessageFromStream`) | Where `setStreamMode(...)` fires for each event type | ~150 | Inline into `src/lib/chat/derive-spinner-mode.ts` (see §6) |

> **Note on file 4 (`types.ts`):** The dumped tree didn't include `components/Spinner/types.ts`, but every other Spinner file imports `SpinnerMode` from it. Reconstruct it from the usages — it is exactly the union literal listed above.

> **Note on file 6 (`GlimmerMessage.tsx`):** The dump emits ~340 lines because it's React-Compiler-compiled. The original source (visible in the embedded source map) is ~120 lines. **Use the source map's plain version**, not the compiled output. When reading, look for the `sourcesContent` block at the bottom of the compiled file — that's the canonical source.

---

## 3. The architecture, in one diagram

```
                    ┌──────────────────────────────────┐
                    │  ClockProvider (mount once)      │
                    │  one shared 50ms tick            │
                    └────────────────┬─────────────────┘
                                     │ ClockContext
                                     ▼
        ┌────────────────────────────────────────────────────┐
        │ SpinnerWithVerb     <── re-renders ~25×/turn       │
        │ (parent — props/state changes only)                │
        │  • picks random verb on mount via useState(sample) │
        │  • owns thinkingStatus state (with 2s min-display) │
        │  • computes layout (tips, expanded, teammates)     │
        │  • passes refs (loadingStartTimeRef, etc.) down    │
        └────────────────────┬───────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────────────────┐
        │ SpinnerAnimationRow <── re-renders ~383×/turn      │
        │ (child — owns useAnimationFrame(50))               │
        │  • frame  = floor(time / 120) % SPINNER_FRAMES     │
        │  • glimmerIndex = sweep over message               │
        │  • flashOpacity = sin wave for tool-use mode       │
        │  • tokenCounterRef = smooth interpolation          │
        │  • thinkingShimmer = sin wave after 3s warmup      │
        │  • useStalledAnimation(time, responseLength, ...)  │
        │  • renders <SpinnerGlyph> + <GlimmerMessage>       │
        │     + parts[(suffix), (timer), (tokens), (think)]  │
        └────────────────────────────────────────────────────┘
```

The two-tier split is **load-bearing** — the only reason CC can run a 50ms animation loop on a terminal renderer without melting CPU. **Do not collapse them in the port.**

---

## 4. The five spinner modes, and what fires them

`SpinnerMode = 'thinking' | 'requesting' | 'responding' | 'tool-input' | 'tool-use'`

CC's `handleMessageFromStream` (`utils/messages.ts:2939–3094`) sets the mode in response to raw Anthropic stream events:

| Source event | `setStreamMode(...)` | Meaning |
|---|---|---|
| `stream_request_start` | `'requesting'` | API request fired, awaiting first byte |
| `content_block_start` → `thinking` / `redacted_thinking` | `'thinking'` | Extended-thinking block opened |
| `content_block_start` → `text` | `'responding'` | Text generation begun |
| `content_block_start` → `tool_use` (and friends) | `'tool-input'` | Tool input being streamed in |
| `message_stop` | `'tool-use'` | Tool actually executing (post-stream) |
| `message_delta` / default | `'responding'` | Fallback during text deltas |

**Visual behavior per mode:**

- **`requesting`**: Shimmer sweep is fast (50ms cycle) — signals "we're hammering the API."
- **`responding`**: Slow shimmer (200ms cycle) — calm streaming.
- **`thinking`**: Slow shimmer + the "thinking" / "thought for Ns" status appears in parentheses next to the verb.
- **`tool-input`**: Slow shimmer — looks like responding.
- **`tool-use`**: Slow shimmer + a sine-wave **flash** (`flashOpacity`) over the verb text, distinct from the linear shimmer.

---

## 5. Where Sunder is today (the drift inventory)

These are the only Sunder files that touch streaming visual state today. **All of them get replaced or rewritten** by the port.

| Sunder file | What it does today | After port |
|---|---|---|
| `src/components/ai-elements/shimmer.tsx` | Framer-Motion gradient sweep on text. Used as `<Shimmer as="span">Thinking...</Shimmer>` | **Delete.** Replaced by `<SpinnerWithVerb>` for the streaming row, and `<GlimmerMessage>` (which has its own shimmer math) for inline use. |
| `src/components/chat/message-list.tsx:66–77` | Shows static `thinkingPlaceholder` (an empty assistant bubble that triggers `<Shimmer>Thinking...</Shimmer>` inside `MessageBubble`) when `status === "submitted"` | Replace with `<SpinnerWithVerb mode="requesting" ...>` rendered as a sibling row. |
| `src/components/chat/message-bubble.tsx:161–165` | Renders `<Shimmer>Thinking...</Shimmer>` when `isStreaming && !hasRenderableParts` | Delete this branch — the streaming row now lives outside the bubble. |
| `src/components/ai-elements/reasoning.tsx:164–175` | "Thinking..." shimmer inside reasoning trigger, then "Thought for N seconds" | **Keep.** This is per-reasoning-block UI, not the per-turn spinner. CC doesn't have an analog. |
| `src/components/chat/tool-call-inline.tsx:443–454` | `<LoaderCircle>` spinner per running tool call | **Keep.** This is per-tool-call UI, separate from the per-turn spinner. CC's equivalent lives in its tool renderers. |
| `src/types/chat.ts:17` | `type ChatStatus = "ready" \| "submitted" \| "streaming" \| "error"` (from AI SDK) | **Keep, but layer on top.** See §6 — we derive `SpinnerMode` from `status` + `messages` rather than replacing it. |

---

## 6. The single justified drift: deriving `SpinnerMode` from AI SDK state

CC drives `streamMode` directly from Anthropic API stream events because it owns the stream. Sunder uses `@ai-sdk/react`'s `useChat`, which only exposes the coarse `status: "ready" | "submitted" | "streaming" | "error"` and the `messages` array. We do not have access to raw `content_block_start` events on the client.

**Drift:** Add a `deriveSpinnerMode(status, messages)` helper. Compute `SpinnerMode` from observable `messages[].parts[]` shape on every render.

**Why it's justified:** AI SDK is our transport. Forking it to expose raw events would be a much bigger drift than this derivation.

**The derivation (verbatim — copy this into `src/lib/chat/derive-spinner-mode.ts`):**

```typescript
import type { ChatStatus } from "@/types/chat";
import type { ChatUIMessage } from "@/components/chat/message-content";
import type { SpinnerMode } from "@/components/chat/spinner/types";

/**
 * Derives CC's fine-grained SpinnerMode from AI SDK's coarse ChatStatus +
 * the current messages array. The mapping mirrors CC's handleMessageFromStream
 * (cc-src/utils/messages.ts:2984–3093) — it just looks at the *result* of those
 * events (parts on the last message) instead of the events themselves.
 */
export function deriveSpinnerMode(
  status: ChatStatus,
  messages: ChatUIMessage[],
): SpinnerMode {
  if (status === "submitted") return "requesting";

  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return "responding";

  const lastPart = last.parts.at(-1);
  if (!lastPart) return "responding";

  // tool-input: tool part is still streaming its input JSON
  if (lastPart.type.startsWith("tool-")) {
    const state = (lastPart as { state?: string }).state;
    if (state === "input-streaming" || state === "input-available") {
      return "tool-input";
    }
    // tool-use: tool is executing or output is being processed
    if (state === "output-available" || state === "approval-requested") {
      return "tool-use";
    }
  }

  if (lastPart.type === "reasoning") return "thinking";
  if (lastPart.type === "text") return "responding";

  return "responding";
}
```

Wire it in `chat-panel.tsx` next to `effectiveStatus`:

```typescript
const spinnerMode = useMemo(
  () => deriveSpinnerMode(effectiveStatus, messages),
  [effectiveStatus, messages],
);
```

Pass `spinnerMode` into `<MessageList>`, which passes it to a new sibling `<SpinnerWithVerb>` rendered when `isLoading`.

---

## 7. The unjustified drifts (translations only — keep the code identical)

These drifts exist purely because the host environment differs. The semantics, constants, formulas, and structure stay verbatim. **Do not "improve" them.**

### 7.1 Ink `<Box>` / `<Text>` → `<div>` / `<span>` + Tailwind

CC renders to a terminal cell grid via Ink. Sunder renders to the DOM. The translation table:

| Ink | DOM/Tailwind |
|---|---|
| `<Box flexDirection="row" marginTop={1}>` | `<div className="mt-2 flex flex-row">` |
| `<Box flexWrap="wrap" height={1} width={2}>` | `<div className="inline-flex h-4 w-4">` (height=1 row → `h-4`, width=2 cells → `w-4`) |
| `<Text color={messageColor}>` | `<span className="text-claude">` (Flexoki token) |
| `<Text color={toRGBColor(rgb)}>` | `<span style={{ color: \`rgb(${r},${g},${b})\` }}>` (inline because the value is dynamic) |
| `<Text dimColor>` | `<span className="text-muted-foreground">` |

**Color tokens.** CC's `messageColor: 'claude'` → Sunder Flexoki `text-claude` (defined in `src/lib/ui/color-maps.ts` if not already — add it as `--color-claude` in the Flexoki layer-2 set). Same for `claudeShimmer` → `text-claude-shimmer`. **Do not** use raw Tailwind palette classes (`text-amber-500` etc.) per Sunder's design system rule.

### 7.2 `useAnimationFrame` and `ClockContext` — keep them, almost verbatim

CC's `useAnimationFrame` is essentially a polyfill for `requestAnimationFrame` that:
1. Throttles to a configurable interval (50ms here, not 16ms).
2. Pauses when the element is offscreen.
3. Slows when the terminal is blurred.

You might think "we have `requestAnimationFrame` natively, just use it." **Don't.** Keep CC's hook and context verbatim. Reasons:

- Identical hook signature → identical call sites → identical components.
- `IntersectionObserver` cleanly replaces `useTerminalViewport`.
- Tab visibility (via `document.visibilityState` + `visibilitychange` event) cleanly replaces `useTerminalFocus`.
- Synchronized tick across multiple animation consumers is genuinely useful for the shimmer + glyph + token counter all advancing together.

**The two specific changes** (and only these two):

```typescript
// src/components/chat/spinner/clock-context.tsx
// Was: useTerminalFocus() from ../hooks/use-terminal-focus.js
// Now: a tiny tab-visibility hook
function useTabVisible(): boolean {
  const [visible, setVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden,
  );
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}
// FRAME_INTERVAL_MS = 50 (was: imported from cc-src/ink/constants.ts — copy the value)
const FRAME_INTERVAL_MS = 50;
const BLURRED_TICK_INTERVAL_MS = FRAME_INTERVAL_MS * 2;
```

```typescript
// src/components/chat/spinner/use-animation-frame.ts
// Was: useTerminalViewport() from ./use-terminal-viewport.js
// Now: useInViewport() — IntersectionObserver wrapper
function useInViewport(): [(el: HTMLElement | null) => void, { isVisible: boolean }] {
  const [isVisible, setIsVisible] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const setRef = useCallback((el: HTMLElement | null) => {
    observerRef.current?.disconnect();
    if (!el) return;
    observerRef.current = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observerRef.current.observe(el);
  }, []);
  useEffect(() => () => observerRef.current?.disconnect(), []);
  return [setRef, { isVisible }];
}
```

The rest of `clock-context.tsx` and `use-animation-frame.ts` is **byte-for-byte the same** as cc-src.

### 7.3 `getDefaultCharacters()` — pick one path

CC's version branches on `process.env.TERM === 'xterm-ghostty'` and `process.platform === 'darwin'`. For web, just collapse to the darwin set (the canonical one):

```typescript
export function getDefaultCharacters(): string[] {
  return ['·', '✢', '✳', '✶', '✻', '✽'];
}
```

The forward+reverse frame array (`SPINNER_FRAMES = [...DEFAULT_CHARACTERS, ...[...DEFAULT_CHARACTERS].reverse()]`) stays identical. Frame index advancement (`Math.floor(time / 120)`) stays identical.

### 7.4 `figures` package → lucide

CC imports `figures` for terminal-friendly Unicode (`figures.arrowDown` = `↓`, `figures.tick` = `✔`). On web:

| CC | Sunder |
|---|---|
| `figures.arrowDown` | `<ChevronDown className="size-3" />` from lucide-react |
| `figures.tick` | `<Check className="size-3" />` |

For the spinner specifically, the only `figures` usage in `SpinnerAnimationRow.tsx` is `figures.arrowDown` next to the token counter. Replace with the lucide equivalent.

### 7.5 Theme tokens (`'claude'`, `'claudeShimmer'`)

CC's theme has `claude` (the orange-amber primary) and `claudeShimmer` (a brighter highlight). For Sunder, define the equivalent Flexoki tokens in `src/app/globals.css` and `src/lib/ui/color-maps.ts`:

```css
/* globals.css — Flexoki layer 2 */
:root {
  --color-claude: #d97757;        /* CC's primary orange */
  --color-claude-shimmer: #f0a68a; /* CC's shimmer highlight */
}
```

Use `text-claude` and `text-claude-shimmer` everywhere CC uses `messageColor: 'claude'`. The RGB color interpolation in `utils.ts` (`parseRGB`, `interpolateColor`, `toRGBColor`) needs concrete RGB values — read them from the CSS custom properties at module load using `getComputedStyle(document.documentElement)`, or just hardcode them in `utils.ts` (CC hardcodes too: `ERROR_RED = { r: 171, g: 43, b: 63 }`).

### 7.6 Remove swarm/teammate code

`SpinnerWithVerb` has substantial branches for `foregroundedTeammate`, `hasRunningTeammates`, `TeammateSpinnerTree`, `viewingAgentTaskId`, etc. Sunder doesn't have multi-agent today. **Strip these branches** during the port — leave the verb-picking, thinking-status effect, and `<SpinnerAnimationRow>` render. Roughly: keep `Spinner.tsx` lines 82–171, 211–214, and 280–301; drop everything else for now.

### 7.7 Remove tip system, brief mode, budget text, expanded todos

These are CC features Sunder doesn't have. Drop:

- `BriefSpinner` (lines 312+ of `Spinner.tsx`)
- `effectiveTip` / `showClearTip` / `showBtwTip` logic
- `TaskListV2` / `useTasksV2` / `expandedView === 'tasks'`
- `budgetText` / `getCurrentTurnTokenBudget`

**Keep only** the verb + spinner row + thinking status. We can add tips back later as a follow-up PR.

### 7.8 React Compiler artifacts (`_c`, `$[...]`)

The dumped `.tsx` files are post-React-Compiler. They look like:

```typescript
const $ = _c(9);
let t4;
if ($[0] !== isDim || $[1] !== messageColor) {
  t4 = <Box ...>...</Box>;
  $[0] = isDim;
  ...
} else {
  t4 = $[2];
}
return t4;
```

**Read the `sourcesContent` field at the bottom of each file** — it's the original pre-compile source. Copy that, not the `_c`/`$[...]` version. The original is dramatically shorter and clearer. (Sunder is not running React Compiler; we don't need the artifacts.)

---

## 8. The implementation order (PR-by-PR)

Each PR is independently reviewable. **Do not batch.**

### PR-A: Foundations (no UI change)

Files:
- `src/components/chat/spinner/clock-context.tsx` — copy from `cc-src/ink/components/ClockContext.tsx`, swap `useTerminalFocus` → `useTabVisible`.
- `src/components/chat/spinner/use-animation-frame.ts` — copy from `cc-src/ink/hooks/use-animation-frame.ts`, swap `useTerminalViewport` → `useInViewport`.
- `src/components/chat/spinner/utils.ts` — copy `cc-src/components/Spinner/utils.ts` verbatim except simplify `getDefaultCharacters()` to the darwin path.
- `src/components/chat/spinner/types.ts` — define `SpinnerMode` union.
- `src/lib/chat/spinner-verbs.ts` — copy `cc-src/constants/spinnerVerbs.ts` (drop the `getInitialSettings()` accessor; export `SPINNER_VERBS` and a simple `getSpinnerVerbs()` that just returns it).
- `src/lib/chat/spinner-figures.ts` — copy `cc-src/constants/figures.ts` (only the `TEARDROP_ASTERISK` constant is strictly needed).

Mount `<ClockProvider>` once at the top of the chat layout (`src/app/(dashboard)/chat/layout.tsx` if it exists, else `chat-panel.tsx` at the top level).

**Test:** Render a throwaway component using `useAnimationFrame(50)` and verify the time advances. Verify pausing on tab blur (`document.hidden` → tick interval doubles).

### PR-B: SpinnerGlyph + AnimatedAsterisk

Files:
- `src/components/chat/spinner/spinner-glyph.tsx` — copy `cc-src/components/Spinner/SpinnerGlyph.tsx` source (the unchecked `sourcesContent`), translate Ink → DOM per §7.1.
- `src/components/chat/spinner/animated-asterisk.tsx` — copy `cc-src/components/LogoV2/AnimatedAsterisk.tsx` source. Use it on `<ChatWelcome>` and any "idle" placeholder.

**Test:** Render `<SpinnerGlyph frame={time / 120} messageColor="claude" />` driven by `useAnimationFrame(120)`. Confirm 6 frames forward, 6 reverse.

### PR-C: GlimmerMessage + stall + shimmer hooks

Files:
- `src/components/chat/spinner/use-stalled-animation.ts` — copy `cc-src/components/Spinner/useStalledAnimation.ts` **byte-for-byte** (it's pure logic, no Ink).
- `src/components/chat/spinner/use-shimmer-animation.ts` — copy `cc-src/components/Spinner/useShimmerAnimation.ts` byte-for-byte (also pure logic; it returns a position number and the ref from `useAnimationFrame`).
- `src/components/chat/spinner/glimmer-message.tsx` — port from `cc-src/components/Spinner/GlimmerMessage.tsx` source. This is the longest port. Don't simplify the `requesting` vs `responding` vs `tool-use` branches — they each handle a different visual.

**Test:** Mount `<GlimmerMessage message="Cogitating..." mode="responding" messageColor="claude" shimmerColor="claudeShimmer" glimmerIndex={...} flashOpacity={0} />` and verify the shimmer sweeps over the verb.

### PR-D: SpinnerAnimationRow (the 50ms loop child)

Files:
- `src/components/chat/spinner/spinner-animation-row.tsx` — port from `cc-src/components/Spinner/SpinnerAnimationRow.tsx` source. Strip `foregroundedTeammate`, `hasRunningTeammates`, `teammateTokens`, `leaderIsIdle` props. Keep everything else: stall hook, frame counter, glimmer, flash opacity, token counter smoothing, elapsed timer, thinking shimmer, progressive width gating, parts assembly with `<Byline>`-style separator (use Sunder equivalent: a simple `·` separator span).

**The constants stay verbatim:**
```typescript
const SEP_WIDTH = 3; // ' · '
const THINKING_BARE_WIDTH = 8; // 'thinking'
const SHOW_TOKENS_AFTER_MS = 30_000;
const THINKING_INACTIVE = { r: 153, g: 153, b: 153 };
const THINKING_INACTIVE_SHIMMER = { r: 185, g: 185, b: 185 };
const THINKING_DELAY_MS = 3000;
const THINKING_GLOW_PERIOD_S = 2;
```

**The token counter smoothing stays verbatim** (cc-src `SpinnerAnimationRow.tsx:142–158`):
```typescript
const gap = currentResponseLength - tokenCounterRef.current;
if (gap > 0) {
  let increment;
  if (gap < 70) increment = 3;
  else if (gap < 200) increment = Math.max(8, Math.ceil(gap * 0.15));
  else increment = 50;
  tokenCounterRef.current = Math.min(
    tokenCounterRef.current + increment,
    currentResponseLength,
  );
}
```

**The thinking shimmer formula stays verbatim** (`SpinnerAnimationRow.tsx:198–200`):
```typescript
const thinkingElapsedSec = (time - THINKING_DELAY_MS) / 1000;
const thinkingOpacity = time < THINKING_DELAY_MS
  ? 0
  : (Math.sin(thinkingElapsedSec * Math.PI * 2 / THINKING_GLOW_PERIOD_S) + 1) / 2;
```

### PR-E: SpinnerWithVerb (the parent)

Files:
- `src/components/chat/spinner/spinner-with-verb.tsx` — port from `cc-src/components/Spinner.tsx` lines 82–301. Strip per §7.6 and §7.7.
- `src/components/chat/spinner/index.ts` — re-export `SpinnerWithVerb` and `SpinnerMode`.

**The thinking-status effect stays verbatim** (`Spinner.tsx:127–159`):
```typescript
const [thinkingStatus, setThinkingStatus] = useState<'thinking' | number | null>(null);
const thinkingStartRef = useRef<number | null>(null);
useEffect(() => {
  let showDurationTimer: ReturnType<typeof setTimeout> | null = null;
  let clearStatusTimer: ReturnType<typeof setTimeout> | null = null;
  if (mode === 'thinking') {
    if (thinkingStartRef.current === null) {
      thinkingStartRef.current = Date.now();
      setThinkingStatus('thinking');
    }
  } else if (thinkingStartRef.current !== null) {
    const duration = Date.now() - thinkingStartRef.current;
    const remainingThinkingTime = Math.max(0, 2000 - duration);
    thinkingStartRef.current = null;
    const showDuration = (): void => {
      setThinkingStatus(duration);
      clearStatusTimer = setTimeout(() => setThinkingStatus(null), 2000);
    };
    if (remainingThinkingTime > 0) {
      showDurationTimer = setTimeout(showDuration, remainingThinkingTime);
    } else {
      showDuration();
    }
  }
  return () => {
    if (showDurationTimer) clearTimeout(showDurationTimer);
    if (clearStatusTimer) clearTimeout(clearStatusTimer);
  };
}, [mode]);
```

**The verb picker stays verbatim** (`Spinner.tsx:165–171`):
```typescript
const [randomVerb] = useState(() => sample(getSpinnerVerbs()));
const message = (overrideMessage ?? randomVerb) + '…';
```

(Use `lodash-es/sample` or write a 3-line `pickRandom(arr)` helper — `sample` is just `arr[Math.floor(Math.random() * arr.length)]`.)

### PR-F: Wire into Sunder chat

Files:
- `src/lib/chat/derive-spinner-mode.ts` — add the helper from §6.
- `src/components/chat/chat-panel.tsx` — derive `spinnerMode`, mount `<ClockProvider>` at the top, pass `spinnerMode` to `<MessageList>`.
- `src/components/chat/message-list.tsx` — replace the `thinkingPlaceholder` block with `<SpinnerWithVerb mode={spinnerMode} ... />` rendered as a sibling of the message list (not inside a `MessageBubble`).
- `src/components/chat/message-bubble.tsx` — delete lines 161–165 (the old `<Shimmer>Thinking...</Shimmer>` placeholder).
- `src/components/ai-elements/shimmer.tsx` — **delete this file entirely.** Update the only remaining caller (`reasoning.tsx`) to use a much simpler inline shimmer (or just plain text — the per-reasoning UI is far less prominent than the per-turn spinner).

**Refs to thread:** `loadingStartTimeRef`, `totalPausedMsRef`, `pauseStartTimeRef`, `responseLengthRef`. CC creates these in `REPL.tsx`. Sunder needs them in `chat-panel.tsx`:

```typescript
const loadingStartTimeRef = useRef(Date.now());
const totalPausedMsRef = useRef(0);
const pauseStartTimeRef = useRef<number | null>(null);
const responseLengthRef = useRef(0);

// Reset on each new turn
useEffect(() => {
  if (status === "submitted") {
    loadingStartTimeRef.current = Date.now();
    totalPausedMsRef.current = 0;
    pauseStartTimeRef.current = null;
    responseLengthRef.current = 0;
  }
}, [status]);

// Update response length as text streams in
useEffect(() => {
  const last = messages.at(-1);
  if (last?.role !== "assistant") return;
  const totalLength = last.parts.reduce((sum, p) => {
    if (p.type === "text") return sum + ((p as { text: string }).text?.length ?? 0);
    if (p.type === "reasoning") return sum + ((p as { text: string }).text?.length ?? 0);
    return sum;
  }, 0);
  responseLengthRef.current = totalLength;
}, [messages]);
```

---

## 9. What to verify after the port

1. **Visual diff against CC**: Open `cc-src` running locally (`npm i -g @anthropic-ai/claude-code && claude`), trigger a long response, screenshot. Then open Sunder, trigger a long response, screenshot. The verb, glyph, shimmer direction, color, thinking status placement, token counter format, elapsed timer should all match modulo color tokens.
2. **Stall test**: Send a prompt that produces a long thinking phase, then network-pause via DevTools. After 3s the spinner glyph and verb should fade to red over 2s.
3. **Reduced motion**: Set OS reduced-motion preference. The spinner should become a flashing dot, the shimmer should disappear, the token counter should jump (no smoothing), the asterisk should be static grey.
4. **Tab visibility**: Switch to another tab during a long response. The animation should slow (BLURRED_TICK_INTERVAL_MS = 100ms instead of 50ms). Switch back — should resume.
5. **Offscreen pause**: Scroll the message list so the spinner row is offscreen. The animation should pause entirely (no ticks). Scroll back — resume.
6. **Mode transitions**: Trigger a turn that thinks, then responds, then calls a tool, then responds again. The spinner should transition `requesting → thinking → responding → tool-input → tool-use → responding`. Verify shimmer speed changes between requesting (fast) and other modes (slow).
7. **Thinking duration**: Verify "thinking..." displays for at least 2s even on very fast thinking turns; verify "thought for Ns" then displays for 2s before disappearing.

---

## 10. Things you might be tempted to "improve" — don't

- **Don't replace `useAnimationFrame(50)` with CSS animations.** The shimmer position depends on message length and mode; the token counter depends on a ref; the stall detection depends on time deltas. CSS can't see any of those.
- **Don't replace the two-tier parent/child split with a single component.** That single component will re-render 383×/turn including all its expensive children.
- **Don't reduce the verb list to "a few good ones."** The randomness is the charm. Ship all 204.
- **Don't change the spinner glyph characters.** `'·', '✢', '✳', '✶', '✻', '✽'` are hand-picked for visual continuity.
- **Don't change the shimmer speed multipliers** (50ms requesting, 200ms others). They're tuned.
- **Don't change the stall thresholds** (3s warmup, 2s fade). They're tuned.
- **Don't change the token counter increments** (3 / max(8, 15%) / 50). They're tuned for "smooth but not lagging."
- **Don't add smoothing to mode transitions.** They should be instant — the visual changes (shimmer speed, flash) are the indicator.
- **Don't move `useState(() => sample(...))` into a `useMemo`.** `useState` with an initializer is the idiomatic "pick once on mount" pattern; `useMemo` would re-pick if deps changed.

---

## 11. Cross-references

- Sunder design system / Flexoki tokens: `CLAUDE.md` § "UI and Styling" and `src/lib/ui/color-maps.ts`.
- AI SDK `useChat`: `src/components/chat/chat-panel.tsx:178–199`.
- Existing reasoning shimmer (kept as-is): `src/components/ai-elements/reasoning.tsx:164–175`.
- Existing tool-call spinner (kept as-is): `src/components/chat/tool-call-inline.tsx:443–454`.
- CC source dump: `/Users/sethlim/Documents/cc-src`.

---

## 12. Tests + docs to update

**New tests** (Vitest + RTL):
- `src/components/chat/spinner/__tests__/spinner-glyph.test.tsx` — frame index advances, reduced-motion path, stall path.
- `src/components/chat/spinner/__tests__/use-stalled-animation.test.ts` — pure logic test, no rendering. Verify intensity is 0 before 3s, ramps to 1 over 2s, resets when tokens arrive.
- `src/components/chat/spinner/__tests__/spinner-with-verb.test.tsx` — verb is picked once and stays stable across re-renders; thinking status transitions through `'thinking' → number → null` with the 2s minimum.
- `src/lib/chat/__tests__/derive-spinner-mode.test.ts` — table-driven test for each `(status, lastPart.type, state)` → expected `SpinnerMode`.

**Docs to touch** (if relevant):
- `CLAUDE.md` § "UI and Styling" — add `--color-claude` and `--color-claude-shimmer` to the Flexoki section.
- `roadmap docs/Sunder - Source of Truth/references/claude/claude-code-spinner-system.md` — this file (already done).
- The v2 plan JSON (`docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`) — add a PR row for "spinner system port" if you want it tracked.

No production runtime docs need updating — this is a self-contained UI system.
