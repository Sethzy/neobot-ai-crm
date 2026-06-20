# Claude Code Memory System — Reference Analysis for Sunder

> **Source:** [anthropics/claude-code](https://github.com/anthropics/claude-code) (binary analysis v2.1.63 + official docs)
> **Feature scope:** Auto-memory system only (not CLAUDE.md user-written instructions)
> **Date:** 2026-03-06
> **Companion doc:** `codex-memory-system.md` (same folder) — OpenAI Codex memory analysis

---

## Part I: Patterns the Claude Code Codebase Uses

### 1. Agent Writes Memory Inline During Conversation

Unlike Codex (which uses a background pipeline), Claude Code's agent writes memory **during the conversation** using the same file tools it uses for everything else (`Write`, `Edit`). There is no background extraction or consolidation process.

The agent is instructed to:
- Organize memory semantically by topic, not chronologically
- Keep MEMORY.md concise (index/pointers) and move detailed notes to topic files
- Update or remove memories that turn out to be wrong or outdated
- Not write duplicate memories — check existing memory first
- Save immediately when the user explicitly asks to remember something

### 2. Single Entrypoint File + Topic Files

```
~/.claude/projects/<encoded-project-path>/memory/
├── MEMORY.md          # Concise index, first 200 lines loaded every session
├── debugging.md       # Agent-created topic file
├── patterns.md        # Agent-created topic file
├── api-conventions.md # Agent-created topic file
└── ...                # Any topic files the agent decides to create
```

- **MEMORY.md** is the only file auto-loaded (first 200 lines). It acts as an index/routing layer.
- **Topic files** are NOT loaded at startup. The agent reads them on-demand using standard file tools when it needs the information.
- Topic files are NOT pre-seeded — the agent creates them organically as needed.

### 3. Memory Instructions in Static System Prompt

Claude Code injects memory instructions as a dedicated section in the system prompt (not the system-reminder):

```
# auto memory

You have a persistent auto memory directory at `<path>`.
Its contents persist across conversations.

As you work, consult your memory files to build on previous experience.

## How to save memories:
- Organize memory semantically by topic, not chronologically
- Use the Write and Edit tools to update your memory files
- `MEMORY.md` is always loaded into your conversation context — lines after 200 will be truncated
- Create separate topic files (e.g., `debugging.md`, `patterns.md`) for detailed notes
  and link to them from MEMORY.md
- Update or remove memories that turn out to be wrong or outdated
- Do not write duplicate memories. First check if there is an existing memory you can update.

## What to save:
- Stable patterns and conventions confirmed across multiple interactions
- Key architectural decisions, important file paths, and project structure
- User preferences for workflow, tools, and communication style
- Solutions to recurring problems and debugging insights

## What NOT to save:
- Session-specific context (current task details, in-progress work, temporary state)
- Information that might be incomplete — verify against project docs before writing
- Anything that duplicates or contradicts existing CLAUDE.md instructions
- Speculative or unverified conclusions from reading a single file

## Explicit user requests:
- When the user asks you to remember something across sessions, save it immediately
- When the user asks to forget or stop remembering something, remove the relevant entries
```

### 4. Memory Content Injected via system-reminder Tag

The actual MEMORY.md content (first 200 lines) is loaded alongside CLAUDE.md files and injected as part of the `<system-reminder>` context block prepended to messages:

```
<system-reminder>
As you answer the user's questions, you can use the following context:
# claudeMd
Codebase and user instructions are shown below...

Contents of ~/.claude/projects/.../memory/MEMORY.md (user's auto-memory, persists across conversations):

<actual MEMORY.md content here, first 200 lines>

IMPORTANT: this context may or may not be relevant to your tasks.
</system-reminder>
```

Key details:
- MEMORY.md is labeled `"(user's auto-memory, persists across conversations)"` to distinguish it from CLAUDE.md files
- It sits alongside other CLAUDE.md files in the same `claudeMd` context string
- The 200-line cap is enforced at load time — if the file exceeds 200 lines, a warning is appended

### 5. 200-Line Truncation with Warning

```javascript
if (lines.length > 200) {
  content = lines.slice(0, 200).join("\n") +
    `\n\n> WARNING: MEMORY.md is ${lines.length} lines (limit: 200). Only the first 200 lines were loaded...`;
}
```

This is a hard truncation — not a token-based limit. The warning tells the agent to be concise and move detail to topic files.

### 6. Memory Directory Path Derivation

```javascript
function encodePath(path) {
  let encoded = path.replace(/[^a-zA-Z0-9]/g, "-");
  if (encoded.length <= 200) return encoded;
  let hash = Bun.hash(path).toString(36);
  return `${encoded.slice(0, 200)}-${hash}`;
}

// Final path: ~/.claude/projects/{encoded-git-root}/memory/MEMORY.md
```

- Derived from the git repository root (all subdirectories share one memory)
- Git worktrees get separate memory directories
- Outside git repos, the working directory is used
- Path is encoded to be filesystem-safe (replace non-alphanumeric with `-`)
- Paths longer than 200 chars are truncated with a hash suffix

### 7. Feature Toggle (Three-Layer Precedence)

```javascript
function isAutoMemoryEnabled() {
  // 1. Environment variable (highest priority, overrides everything)
  if (CLAUDE_CODE_DISABLE_AUTO_MEMORY is truthy) return false;
  if (CLAUDE_CODE_DISABLE_AUTO_MEMORY is falsy)  return true;

  // 2. Settings.json (user or project level)
  if (settings.autoMemoryEnabled !== undefined) return settings.autoMemoryEnabled;

  // 3. Default: enabled
  return true;
}
```

### 8. Memory Loading Priority in Full Context

All memory types load in this order (later = higher priority):

1. **Managed policy** — `/Library/Application Support/ClaudeCode/CLAUDE.md` (org-wide)
2. **User memory** — `~/.claude/CLAUDE.md` (personal, all projects)
3. **User rules** — `~/.claude/rules/*.md` (personal modular rules)
4. **Project memory** — Walk up directory tree collecting all `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md`
5. **Local memory** — `CLAUDE.local.md` (personal, project-specific, gitignored)
6. **Auto-memory** — `~/.claude/projects/<project>/memory/MEMORY.md` (agent-written, 200-line cap)

All are assembled into a single `claudeMd` string and injected in one `<system-reminder>` block.

### 9. No Structured Schema for MEMORY.md

Claude Code does NOT enforce a schema for MEMORY.md content. The agent writes free-form markdown. The only guidance is:
- Organize semantically by topic
- Keep it concise (200-line cap)
- Link to topic files for detail
- Use bullet points

### 10. No Background Processing, No Consolidation, No Forgetting

- No Phase 1/Phase 2 pipeline (unlike Codex)
- No usage tracking
- No automatic forgetting or eviction
- No consolidation agent
- Memory only grows (agent can manually prune, but no automated mechanism)
- The 200-line MEMORY.md cap is the only natural pressure against unbounded growth

---

## Part II: Files to Copy and Reference

Since Claude Code is not fully open source (distributed as compiled binary), there are no source files to copy directly. Instead, we reference the **patterns and instructions** extracted from the binary and official documentation.

### A. Memory Instructions (COPY — these are the exact instructions from the binary)

| Source | Purpose | Sunder Target | Action |
|---|---|---|---|
| Auto-memory system prompt section (extracted above) | Instructions for how agent should use memory | `src/lib/ai/system-prompt.ts` `<memory-system>` section | **Copy.** The "How to save", "What to save", "What NOT to save", and "Explicit user requests" sections are directly applicable. |
| 200-line truncation + warning logic | Prevent memory bloat | `src/lib/memory/loader.ts` `truncateToLineCount()` | **Reference.** Add warning message when truncated (Sunder silently truncates today). |
| Memory file labeling in context (`"user's auto-memory, persists across conversations"`) | Help agent distinguish memory from other context | `src/lib/runner/context.ts` | **Reference.** Currently using `<working-memory>` tag — consider adding a label. |

### B. Architecture Patterns (REFERENCE — adopt the approach)

| Pattern | Claude Code Implementation | Sunder Equivalent | Action |
|---|---|---|---|
| Single entrypoint + topic files | MEMORY.md as index, topic files on-demand | `src/lib/memory/constants.ts`, `templates.ts` | **Already similar.** Sunder has MEMORY.md + 4 pre-seeded topic files. Claude Code lets the agent create topic files organically (no pre-seeding). |
| Agent-driven inline memory writes | Agent uses Write/Edit tools during conversation | `src/lib/runner/tools/storage/` (read_file/write_file) | **Already implemented.** Sunder's agent writes memory inline via write_file. |
| MEMORY.md as only auto-loaded file | Only MEMORY.md loaded into context; topic files read on-demand | `src/lib/memory/loader.ts`, `src/lib/runner/context.ts` | **DRIFT.** Sunder loads SOUL.md + USER.md + MEMORY.md. See Part III. |
| Feature toggle with env var override | 3-layer: env var > settings > default | Could add to Sunder settings | **Defer.** Nice-to-have but not urgent. |

### C. Documentation to Reference

| Source | URL/Location | What to check |
|---|---|---|
| Official Claude Code memory docs | `roadmap docs/.../references/claude/claude-code-memory-system.md` (local copy) | Full docs on all memory types, auto-memory behavior, best practices |
| Claude Code binary (v2.1.63) | `/Users/sethlim/.local/share/claude/versions/2.1.63` | Live reference for current behavior (can extract strings with `strings` command) |
| This analysis | `roadmap docs/.../references/memory/claude-code-memory-system.md` | Complete architecture extracted from binary |

---

## Part III: Where Sunder Drifts Today and Whether to Keep It

### Drift 1: Three root files loaded (SOUL + USER + MEMORY) vs single MEMORY.md
| Aspect | Claude Code | Sunder Today |
|---|---|---|
| **What's loaded** | Only MEMORY.md (first 200 lines) | SOUL.md + USER.md + MEMORY.md (first 200 lines) — all three injected |
| **Separation of concerns** | All in one file — agent persona, user profile, and working memory are all in MEMORY.md or topic files | Three dedicated files: persona (SOUL), user profile (USER), working memory (MEMORY) |

**Verdict: JUSTIFIED DRIFT — keep, but evolve.**

Reasons to keep:
1. **SOUL.md is valuable separation.** Sunder is a SaaS product with a consistent persona. Having a read-only SOUL.md that the agent cannot modify protects brand consistency. Claude Code doesn't need this because it's a developer tool with no persona.
2. **USER.md is valuable separation.** Real estate agent profile data (contact info, specializations, preferences) is structurally different from working memory. Keeping it separate makes it easier for the agent to update user info without mixing it into the working memory index.
3. **However:** Loading all three every turn is wasteful as they grow. The Codex pattern of injecting only a summary and letting the agent read the rest on-demand is better long-term.

**Recommended evolution:**
- Phase A (now): Keep all three but add the "What to save / What NOT to save" quality instructions from Claude Code
- Phase B (later): Add `memory_summary.md` (per Codex analysis), inject only that, let agent read SOUL/USER/MEMORY on-demand

### Drift 2: Pre-seeded topic files vs organic creation
| Aspect | Claude Code | Sunder Today |
|---|---|---|
| **Topic files** | Agent creates them organically — no pre-seeded files | 4 pre-seeded files: `memory/preferences.md`, `memory/growth-plan.md`, `memory/patterns.md`, `memory/key-decisions.md` |

**Verdict: MINIMAL DRIFT — keep pre-seeding, relax rigidity.**

Reasons to keep pre-seeding:
1. Sunder's domain is narrower than Claude Code's. Pre-seeded topics (preferences, patterns, key-decisions) make sense for a real estate CRM assistant.
2. Without pre-seeding, the agent might not create topic files early enough, leading to a bloated MEMORY.md.

**What to change:**
- Remove the rigid auto-write rules mapping specific topics to specific files ("preferences.md — write immediately when..."). Instead, adopt Claude Code's simpler guidance: "Organize memory semantically by topic, create separate topic files for detailed notes, link from MEMORY.md."
- The agent should feel free to create NEW topic files beyond the 4 pre-seeded ones (this is already supported but not well-encouraged).

### Drift 3: Auto-write rules (rigid) vs general guidance (flexible)
| Aspect | Claude Code | Sunder Today |
|---|---|---|
| **Write guidance** | General principles: "stable patterns confirmed across multiple interactions", "key architectural decisions", "user preferences", "solutions to recurring problems" | Rigid per-file rules: "preferences.md — write immediately when...", "patterns.md — write after 3+ instances" |

**Verdict: DRIFT WE SHOULD FIX.**

Claude Code's approach is better because:
1. **Rigid rules are fragile.** "Write after 3+ instances" — how does the agent count instances across sessions? It can't reliably do this.
2. **General guidance is more robust.** "Stable patterns confirmed across multiple interactions" conveys the same intent without requiring counting.
3. **Less cognitive load.** The agent doesn't need to remember which file maps to which trigger rule.

**What to do:** Replace the auto-write rules section with Claude Code's "What to save" / "What NOT to save" pattern, adapted for Sunder's domain:

```
## What to save:
- Stable user preferences confirmed across multiple interactions
- Key decisions about deals, clients, or workflow
- Communication style and working patterns
- Solutions to recurring problems and useful shortcuts
- Important client relationships and deal context

## What NOT to save:
- Session-specific context (current task details, in-progress work)
- Information already stored in the CRM database
- Speculative conclusions from a single interaction
- Anything that duplicates the system prompt or SOUL.md
```

### Drift 4: No "What NOT to save" guidance
| Aspect | Claude Code | Sunder Today |
|---|---|---|
| **Negative guidance** | Explicit "What NOT to save" section with 4 clear rules | Single line: "Do not save: session-specific context, information already in CRM database, speculative conclusions from a single instance." |

**Verdict: DRIFT WE SHOULD FIX.**

Claude Code's negative guidance is more comprehensive and structured. Sunder's single-line list is easy to miss.

**What to do:** Expand to a proper bulleted section matching Claude Code's format. Add: "Information that might be incomplete — verify against project docs before writing" and "Anything that duplicates or contradicts SOUL.md".

### Drift 5: No duplicate-check instruction
| Aspect | Claude Code | Sunder Today |
|---|---|---|
| **Dedup** | "Do not write duplicate memories. First check if there is an existing memory you can update before writing a new one." | No equivalent instruction |

**Verdict: DRIFT WE SHOULD FIX.**

Without this, the agent will accumulate redundant entries. Simple instruction to add.

### Drift 6: No truncation warning
| Aspect | Claude Code | Sunder Today |
|---|---|---|
| **Truncation** | Appends `> WARNING: MEMORY.md is N lines (limit: 200). Only the first 200 lines were loaded...` when truncated | Silent truncation — agent doesn't know it happened |

**Verdict: DRIFT WE SHOULD FIX.**

If the agent doesn't know MEMORY.md was truncated, it can't take corrective action (moving content to topic files). The warning is trivial to implement.

**What to do:** Add warning to `truncateToLineCount()` in `src/lib/memory/loader.ts`.

### Drift 7: No "Explicit user requests" section
| Aspect | Claude Code | Sunder Today |
|---|---|---|
| **User commands** | "When the user asks you to remember something, save it immediately. When the user asks to forget, remove the entries." | No explicit handling of user memory requests |

**Verdict: DRIFT WE SHOULD FIX.**

Users will naturally say things like "remember that Mrs. Tan prefers morning viewings" or "forget what I said about the Bishan deal". The agent needs clear instructions for handling these.

### Drift 8: Supabase Storage vs local filesystem
| Aspect | Claude Code | Sunder Today |
|---|---|---|
| **Storage** | Local filesystem (`~/.claude/projects/<project>/memory/`) | Supabase Storage (`agent-files` bucket, per-client) |

**Verdict: JUSTIFIED DRIFT — keep.**

Same as Codex analysis. Sunder is multi-tenant SaaS; Supabase Storage is the correct choice. Claude Code is a single-user CLI tool.

### Drift 9: SOUL.md (read-only persona file)
| Aspect | Claude Code | Sunder Today |
|---|---|---|
| **Persona** | No dedicated persona file. Agent personality comes from the system prompt. | `SOUL.md` — read-only, loaded every run, contains voice and working style |

**Verdict: JUSTIFIED DRIFT — keep.**

SOUL.md is a Sunder product feature. It gives users (and eventually Sunder admins) control over the agent's persona. Claude Code doesn't need this because developers don't customize Claude's personality.

### Drift 10: No feature toggle for memory
| Aspect | Claude Code | Sunder Today |
|---|---|---|
| **Toggle** | 3-layer: env var > settings.json > default (true) | Always enabled, no toggle |

**Verdict: JUSTIFIED DRIFT — defer.**

Not critical for v1. Memory is a core value proposition for Sunder — there's no reason to disable it. Can add a toggle later if needed for debugging or compliance.

---

## Part IV: Recommended Implementation Order

### Immediate (system prompt changes only — no infrastructure)

1. **Adopt "What to save / What NOT to save" format** — Replace rigid auto-write rules with Claude Code's general guidance pattern, adapted for Sunder's domain
2. **Add duplicate-check instruction** — "Do not write duplicate memories. First check if there is an existing memory you can update before writing a new one."
3. **Add "Explicit user requests" section** — "When the user asks you to remember something, save it immediately. When the user asks to forget, remove the relevant entries."
4. **Add truncation warning** — Modify `truncateToLineCount()` in `src/lib/memory/loader.ts` to append a warning when MEMORY.md is truncated
5. **Relax topic file rigidity** — Encourage agent to create new topic files organically beyond the 4 pre-seeded ones

### Medium-term (code changes)

6. **Add truncation warning to loader** — Implement in `src/lib/memory/loader.ts`
7. **Improve memory section labeling** — Add descriptive labels to `<working-memory>`, `<user-profile>`, `<soul>` tags so the agent understands what each contains

---

## Part V: Claude Code vs Codex — Side-by-Side for Sunder

| Dimension | Claude Code | Codex | Sunder Today | Recommendation |
|---|---|---|---|---|
| **Who writes memory** | Agent inline during conversation | Background pipeline (Phase 1 + Phase 2) | Agent inline | **Keep inline** (like Claude Code) — immediate value. Add background consolidation later (like Codex). |
| **What's injected** | MEMORY.md first 200 lines | memory_summary.md (≤5000 tokens) | SOUL.md + USER.md + MEMORY.md (200 lines) | **Phase A:** Keep current. **Phase B:** Add memory_summary.md, inject only that (like Codex). |
| **Memory format** | Free-form markdown | Strict schema (Task Group → keywords → learnings) | Free-form markdown | **Adopt Codex schema** for MEMORY.md. Free-form is not searchable enough. |
| **Memory instructions** | 30 lines (what to save, what not to save) | 168 lines (decision boundary, quick memory pass, verification, stale updates, citations) | 24 lines (auto-write rules) | **Copy Claude Code's** instructions now (simpler). **Add Codex's** read-path instructions later. |
| **Topic files** | Agent-created organically | skills/ with YAML frontmatter | 4 pre-seeded, agent can create more | **Keep pre-seeded** (like Sunder). Relax rigidity (like Claude Code). Add skills later (like Codex). |
| **Signal quality** | "What NOT to save" negative guidance | Explicit no-op gate + high-signal criteria | Single-line exclusion list | **Copy Claude Code's** negative guidance now. **Add Codex's** signal gate later. |
| **Forgetting** | None (manual only) | Usage-based eviction + max_unused_days | None | **Defer.** Neither has a simple solution. Codex's is best but requires pipeline. |
| **Secret redaction** | Not mentioned | `redact_secrets()` on all memory writes | None | **Add** (from Codex). Safety requirement. |
| **Stale memory correction** | Not mentioned | MUST update in same turn when stale detected | Not mentioned | **Add** (from Codex). Quality requirement. |

### Synthesis: What to take from each

**From Claude Code (copy now — simpler, immediately applicable):**
- "What to save / What NOT to save" instruction format
- Duplicate-check instruction
- "Explicit user requests" handling
- Truncation warning
- Organic topic file creation encouragement

**From Codex (copy later — requires more infrastructure):**
- Structured MEMORY.md schema (Task Group → keywords → learnings)
- `memory_summary.md` as the single injected file
- Read-path instructions (decision boundary, quick memory pass, verification)
- Stale memory self-correction rules
- Secret redaction
- Background consolidation pipeline (Phase 1 + Phase 2)
- Usage tracking and forgetting

---

## Part VI: Complete Recommended Memory Prompt (Combining Both)

Here is the recommended `<memory-system>` section for Sunder's system prompt, synthesizing the best of both Claude Code and Codex:

```
<memory-system>
You have a persistent memory system stored as files. These files are loaded into your context every run:
- SOUL.md — your personality and identity (read-only, do not attempt to modify)
- USER.md — user profile (read+write, update as you learn about the user)
- MEMORY.md — your working notebook (read+write, first 200 lines loaded each run)

You also have topic files under memory/ for organized long-term storage:
- memory/preferences.md — lasting user preferences and working style
- memory/growth-plan.md — skill-building roadmap
- memory/patterns.md — recurring behaviors with evidence dates
- memory/key-decisions.md — significant decisions with reasoning

Browse all topic files: read_file("memory/")
Create new topic files freely when an observation doesn't fit existing files.

## How to save memories:
- Organize memory semantically by topic, not chronologically.
- Keep MEMORY.md concise as an index. Move detailed notes into topic files and leave pointers behind.
- Do not write duplicate memories. First check if there is an existing memory you can update before writing a new one.
- Update or remove memories that turn out to be wrong or outdated.

## What to save:
- Stable user preferences confirmed across multiple interactions (e.g., "always calls, never texts")
- Key decisions about deals, clients, or business approach — with reasoning
- Communication style, working patterns, and recurring workflows
- Solutions to recurring problems and useful shortcuts
- Important client relationships and deal context that persists across sessions

## What NOT to save:
- Session-specific context (current task details, in-progress work, temporary state)
- Information already stored in the CRM database (contacts, deals, interactions, tasks)
- Speculative conclusions from a single interaction — wait for confirmation
- Anything that duplicates or contradicts SOUL.md or the system prompt
- Information that might be incomplete — verify before writing

## Explicit user requests:
- When the user asks you to remember something across sessions (e.g., "remember that Mrs. Tan prefers morning viewings"), save it immediately — no need to wait for multiple interactions.
- When the user asks to forget or stop remembering something, find and remove the relevant entries from your memory files.

As MEMORY.md approaches 200 lines, move detailed content to topic files and leave pointers behind.
</memory-system>
```
