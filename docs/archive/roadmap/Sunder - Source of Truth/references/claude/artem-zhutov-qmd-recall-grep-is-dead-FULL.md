# Grep Is Dead: How I Made Claude Code Actually Remember Things

> **Author:** Artem Zhutov (@ArtemXTech)
> **Published:** March 2, 2026
> **Source:** https://x.com/ArtemXTech/article (X Article)
> **Video:** https://youtu.be/RDoTY4_xh0s (42-min walkthrough with live demos)

---

## Core Thesis

Every Claude Code conversation starts from zero. With 700+ sessions in 3 weeks, context is constantly lost — at session start, at compaction (60% context limit), and across days. Grep doesn't scale for retrieval. The solution: **QMD** (a local search engine by Tobias Lutke) + **/recall** (a Claude Code skill), creating a persistent, searchable memory layer.

---

## Key Tools

### QMD — Local Search Engine for Your Vault

- **Repo:** https://github.com/tobi/qmd
- **Author:** Tobias Lutke (@tobi), CEO of Shopify
- **What it does:** Indexes Obsidian vaults (or any markdown collection) and finds anything in under a second
- **Collections:** One QMD collection per vault folder (notes, daily entries, sessions, transcripts)

**Three Search Modes:**

| Mode | Command | How It Works | Best For |
|------|---------|-------------|----------|
| **BM25** | `qmd search` | Deterministic full-text search. Scores by term frequency × inverse document frequency. No AI. | 80% of searches. Structured notes. |
| **Semantic** | `qmd vsearch` | Embeddings-based meaning search. Finds concepts even without exact keywords. | Transcripts, braindumps, fuzzy recall. |
| **Hybrid** | `qmd query` | Combines BM25 + semantic with ranked scoring. | Best overall ranking. High-value queries. |

**Benchmark — searching for "sleep":**
- **Grep:** 200 files of noise. Matches `sleep()` (programming command). No relevance ranking.
- **BM25 (2 sec):** Sleep quality reflections, fragmentation experiments. Relevant results.
- **Semantic:** Finds "bedtime discipline goal" from years ago — 4/5 results don't contain the search words at all.
- **Hybrid:** Ranks sleep quality improvement at 89%, sleep interrupted at 51%, health optimization at 42%.

> "Grep matches strings, BM25 catches relevance, semantic catches meaning."

### Recall — Claude Code Skill for Session Memory

- **Repo (Artem's /recall skill):** Referenced in article, installed as Claude Code skill
- **Related repo:** https://github.com/arjunkmrm/recall — Lightweight alternative (Python stdlib, SQLite FTS5, zero dependencies)
- **What it does:** Loads context before you start working — reconstructs past sessions, searches across collections, visualizes session graphs

**Three Modes:**

| Mode | Command | What It Does |
|------|---------|-------------|
| **Temporal** | `/recall yesterday` | Scans session history by date. Reconstructs timeline, message counts, what was done when. |
| **Topic** | `/recall topic graph` | BM25 search across QMD collections. Returns related files, plans, to-do lists. |
| **Graph** | `/recall graph last week` | Interactive visualization — sessions as colored nodes, files clustered by type. |

### arjunkmrm/recall — Lightweight Session Search

- **Repo:** https://github.com/arjunkmrm/recall
- **Install:** `npx skills add arjunkmrm/recall`
- **Search:** BM25 ranking via SQLite FTS5 over Claude Code + Codex sessions
- **Index:** `~/.recall.db` — incremental indexing of `~/.claude/projects/**/*.jsonl`
- **Features:** Porter stemming, snippet extraction, FTS5 query syntax, session resumption via `claude --resume SESSION_ID`
- **Filtering:** `--project`, `--days N`, `--source claude|codex`, `--limit`
- **Dependencies:** Zero (Python 3.9+ stdlib only)

---

## Architecture

### Session Export Pipeline

```
Session closes → hook fires → export to markdown → embed into QMD index
```

- Claude Code saves all conversations as JSONL files locally
- A terminal-close hook exports and embeds sessions into QMD
- Index is always fresh — no manual steps

### The Stack

```
┌─────────────────────────────────┐
│  Claude Code / OpenClaw         │  ← Interface layer
├─────────────────────────────────┤
│  /recall skill                  │  ← Context loading
├─────────────────────────────────┤
│  QMD search engine              │  ← BM25 + semantic + hybrid
├─────────────────────────────────┤
│  Obsidian vault (local files)   │  ← Data layer
└─────────────────────────────────┘
```

- Obsidian Sync keeps vault in sync between Mac and Mac Mini
- OpenClaw runs 24/7 on Mac Mini for mobile access
- Same vault, same QMD index, same skills — from anywhere

---

## Key Insights

### Why Grep Fails at Scale
- Claude Code's default search: sends Haiku sub-agent to grep through every file
- Tested: 3 minutes, 300 files, poor results
- QMD search: instant, better results, fewer tokens, no sub-agents needed

### Search Mode Selection
- **Start with BM25** — fast, handles structured notes, covers 80% of searches
- **Add semantic** for transcripts and braindumps where exact keywords won't match
- **Claude synthesizes raw QMD results** — hard to parse raw results yourself; let Claude summarize

### Surprising Use Case: Surfacing Forgotten Ideas
- Searched: "find the ideas that I have never acted on"
- Claude ran multiple semantic searches with adapted queries
- Surfaced: PhD writing dashboard idea, illustration app concepts, screen recording plans
- Found a forgotten October note about pushing through discomfort on PhD thesis
- "I didn't remember writing that. I didn't expect the search could surface this."

### The Meta-Lesson
> "Your notes stop being passive. They stop being trapped in your Obsidian world. They actually start doing things."

> "Tools change. A month from now there are going to be new models. So what. If you have your context you can make it work in any situation."

---

## QMD vs arjunkmrm/recall Comparison

| Aspect | QMD | arjunkmrm/recall |
|--------|-----|-------------------|
| **Scope** | General-purpose: docs, vaults, any markdown | Claude Code + Codex sessions only |
| **Search** | BM25 + semantic + hybrid (LLM re-ranking) | BM25 full-text (SQLite FTS5) |
| **Runtime** | Node.js, node-llama-cpp with GGUF models | Python stdlib, SQLite |
| **Dependencies** | Requires local LLM models | Zero (Python 3.9+ stdlib) |
| **Use case** | Full knowledge base retrieval | "Find that conversation where we discussed X" |

Both are **local-first** — no cloud, no API keys.

---

## Tags

`#claude-code` `#memory` `#qmd` `#recall` `#bm25` `#semantic-search` `#obsidian` `#session-management` `#context-loading` `#grep-alternative` `#local-search` `#embeddings` `#knowledge-base` `#tobias-lutke` `#artem-zhutov`

---

**Last Updated:** March 3, 2026
