# Testing if "bash is all you need"

**Authors:**
- Ankur Goyal (Founder & CEO, Braintrust)
- Andrew Qu (Chief of Software, Vercel)

**Published:** January 22, 2026
**Reading Time:** 5 minutes
**Source:** https://vercel.com/blog/testing-if-bash-is-all-you-need

---

## Introduction

We invited [Ankur Goyal](https://x.com/ankrgyl) from [Braintrust](https://www.braintrust.dev/) to share how they tested the "bash is all you need" hypothesis for AI agents.

There's a growing conviction in the AI community that **filesystems and bash are the optimal abstraction for AI agents**. The logic makes sense: LLMs have been extensively trained on code, terminals, and file navigation, so you should be able to give your agent a shell and let it work.

### The Community Conviction

![Arpit Bhayani Tweet](screenshots/vercel-bash-tweet.png)

> **Arpit Bhayani (@arpit_bhayani):**
>
> "Looks like filesystems are the next big thing in AI :) Everybody is playing with it. This is happening because models are trained heavily on coding tasks inside sandboxed environments with shells and filesystems. Hence, they get really good at navigating directories, reading..."
>
> *11:55 AM · Jan 13, 2026 · 755 likes*

**Models inherit shell fluency from coding-heavy training data**

Even non-coding agents may benefit from this approach. Vercel's recent post on [building agents with filesystems and bash](https://vercel.com/blog/how-to-build-agents-with-filesystems-and-bash) showed this by mapping sales calls, support tickets, and other structured data onto the filesystem. The agent greps for relevant sections, pulls what it needs, and builds context on demand.

But there's an alternative view worth testing. **Filesystems may be the right abstraction for exploring and retrieving context, but what about querying structured data?** We [built an eval harness](https://github.com/braintrustdata/bash-agent-evals) to find out.

---

## Setting up the eval

We tasked agents with **querying a dataset of GitHub issues and pull requests**. This type of semi-structured data mirrors real-world use cases like customer support tickets or sales call transcripts.

### Question Complexity Ranged From:

**Simple queries:**
- "How many open issues mention 'security'?"

**Complex queries:**
- "Find issues where someone reported a bug and later someone submitted a pull request claiming to fix it"

### Three Agent Approaches Competed:

1. **SQL agent**: Direct database queries against a SQLite database containing the same data

2. **Bash agent**: Using [just-bash](https://justbash.dev/) to navigate and query JSON files on the filesystem

3. **Filesystem agent**: Basic file tools (search, read) without full shell access

Each agent received the same questions and was scored on accuracy.

---

## Initial Results

```
┌─────────────┬──────────┬────────────┬────────┬──────────┐
│   Agent     │ Accuracy │ Avg Tokens │  Cost  │ Duration │
├─────────────┼──────────┼────────────┼────────┼──────────┤
│   SQL       │  100%    │  155,531   │ $0.51  │   45s    │
│   Bash      │  52.7%   │ 1,062,031  │ $3.34  │  401s    │
│ Filesystem  │  63.0%   │ 1,275,871  │ $3.89  │  126s    │
└─────────────┴──────────┴────────────┴────────┴──────────┘
```

### The Verdict:

**SQL dominated.** It hit 100% accuracy while bash achieved just 53%. Bash also:
- Used **7x more tokens**
- Cost **6.5x more** ($3.34 vs $0.51)
- Took **9x longer** to run (401s vs 45s)

Even basic filesystem tools (search, read) outperformed full bash access, hitting 63% accuracy.

### Direct Links to Experiments:
- [SQL experiment results](https://www.braintrust.dev/app/braintrust-labs/p/bash-evals/experiments/sql-claude-sonnet-4-5?c=bash-claude-sonnet-4-5)
- [Bash experiment results](https://www.braintrust.dev/app/braintrust-labs/p/bash-evals/experiments/bash-claude-sonnet-4-5?c=sql-claude-sonnet-4-5)
- [Filesystem experiment results](https://www.braintrust.dev/app/braintrust-labs/p/bash-evals/experiments/fs-claude-sonnet-4-5?c=bash-sqlite-claude-sonnet-4-5)

### Surprising Finding:

One surprising finding was that the bash agent generated [highly sophisticated shell commands](https://www.braintrust.dev/app/braintrust-labs/p/bash-evals/experiments/bash-claude-sonnet-4-5?c=sql-claude-sonnet-4-5&r=b665a3b6-a046-4584-a8f7-2289ef580384&s=510baab2-879b-4a8e-9f9f-c4cb716dc6f4&fs=1), chaining `find`, `grep`, `jq`, `awk`, and `xargs` in ways that rarely appear in typical agent workflows.

![Sophisticated Shell Scripting](screenshots/vercel-bash-shell-scripting.png)

**The model clearly has deep knowledge of shell scripting, but that knowledge didn't translate to better task performance.**

```bash
# Example of sophisticated bash commands generated:
find data/repos -type f -name "*.json" | \
  xargs grep -l "\"type\":\"bug\"" | \
  xargs jq -r '.number' | \
  awk '{print $1}' | \
  sort | uniq -c
```

---

## Debugging the Results

The eval revealed substantive issues requiring attention.

### 1. Performance Bottlenecks

Commands that should run in milliseconds were **timing out at 10 seconds**.

**Root cause:** `stat()` calls across 68,000 files were the culprit.

**Fix:** The [just-bash tool received optimizations](https://x.com/cramforce/status/2010516747070349709) addressing this.

### 2. Missing Schema Context

The bash agent didn't know the structure of the JSON files it was querying.

**Attempted fix:** Adding schema information and example commands to the system prompt helped, but not enough to close the gap.

### 3. Eval Scoring Issues

Hand-checking failed cases revealed several questions where the "expected" answer was actually wrong, or where the agent found additional valid results that the scorer penalized.

**Five questions received corrections addressing ambiguities or dataset mismatches:**

- "Which repositories have the most unique issue reporters" was **ambiguous** between org-level and repo-level grouping
- Several questions had expected outputs that **didn't match the actual dataset**
- The bash agent sometimes found **more valid results** than the reference answers included

The Vercel team submitted a [PR with the corrections](https://github.com/braintrustdata/bash-agent-evals/pull/5).

**Result:** After fixes to both `just-bash` and the eval itself, the performance gap narrowed considerably.

---

## The Hybrid Approach

Then we tried a different idea. **Instead of choosing one abstraction, give the agent both:**

1. Let it use **bash** to explore and manipulate files
2. Also provide access to a **SQLite database** when that's the right tool

### Emergent Behavior: Self-Verification

The hybrid agent developed an interesting behavior. It would:
1. Run SQL queries
2. Then **verify results by grepping through the filesystem**

This double-checking is why the hybrid approach consistently hits **100% accuracy**, while pure SQL occasionally gets things wrong.

**[Explore the hybrid experiment results directly →](https://www.braintrust.dev/app/braintrust-labs/p/bash-evals/experiments/bash-sqlite-claude-sonnet-4-5?c=)**

### The Tradeoff: Cost vs Reliability

The hybrid approach uses roughly **2x as many tokens** as pure SQL, since it:
- Reasons about tool choice
- Verifies its work through dual approaches

```
┌──────────────────┬──────────┬────────────┬────────┐
│    Approach      │ Accuracy │ Avg Tokens │  Cost  │
├──────────────────┼──────────┼────────────┼────────┤
│ SQL Only         │  ~95%    │  155,531   │ $0.51  │
│ Bash+SQL Hybrid  │  100%    │  ~310,000  │ $1.02  │
└──────────────────┴──────────┴────────────┴────────┘
```

![Hybrid Approach Comparison](screenshots/vercel-bash-hybrid-comparison.png)

**The hybrid approach matched SQL on accuracy while adding self-verification**

---

## Key Learnings

After all the fixes to `just-bash`, the eval dataset, and data loading issues, **bash-sqlite emerged as the most reliable approach**.

The "winner" wasn't raw accuracy on a single run, but **consistent accuracy through self-verification**.

### Over 200 Messages and Hundreds of Traces Later, We Had:

✅ Fixed performance bottlenecks in `just-bash`
✅ Corrected five ambiguous or wrong expected answers in the eval
✅ Found a data loading bug that caused off-by-one errors
✅ Watched agents develop sophisticated verification strategies

### The Unexpected Value of Bash

The bash agent's tendency to **check its own work** turned out to be valuable—not just for accuracy, but also for **surfacing problems that would have gone unnoticed** with a pure SQL approach.

```
Agent Self-Verification Pattern:
┌─────────────────────────────────────────┐
│  1. Execute SQL query                   │
│  2. Get result set                      │
│  3. Grep filesystem for verification    │
│  4. Compare results                     │
│  5. If mismatch → investigate           │
│  6. Return verified answer              │
└─────────────────────────────────────────┘
```

---

## What This Means for Agent Design

### For Structured Data with Clear Schemas:

**SQL remains the most direct path.**
- ✅ Fast
- ✅ Well-understood
- ✅ Uses fewer tokens
- ✅ Direct query semantics

### For Exploration and Verification:

**Bash provides flexibility that SQL can't match.**
- ✅ Agents can inspect files
- ✅ Spot-check results
- ✅ Catch edge cases through filesystem access
- ✅ Self-verification capabilities

### The Bigger Lesson: Evals Drive Improvement

**But the bigger lesson is about evals themselves.**

The back-and-forth between Braintrust and the Vercel team, with **detailed traces at every step**, is what actually improved:
- The tools
- The benchmark
- Our understanding

**Without that visibility, we'd still be debating which abstraction "won" based on flawed data.**

---

## Design Decision Matrix

```
┌─────────────────────────────────────────────────────┐
│          WHEN TO USE WHAT                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Use Case              │ Best Approach              │
│  ──────────────────────┼────────────────────────    │
│                                                     │
│  Structured queries    │ SQL (fastest, cheapest)    │
│  Clear schema          │                            │
│                        │                            │
│  Exploration           │ Bash (flexible)            │
│  Unknown schema        │                            │
│                        │                            │
│  High-stakes           │ Hybrid (self-verifying)    │
│  Critical accuracy     │ (2x cost, 100% accuracy)   │
│                        │                            │
│  File manipulation     │ Bash (native)              │
│  Text processing       │                            │
│                        │                            │
└─────────────────────────────────────────────────────┘
```

---

## Run Your Own Benchmarks

The [eval harness is open source](https://github.com/braintrustdata/bash-agent-evals).

### You Can Swap in Your Own:

1. **Dataset** (customer tickets, sales calls, logs, whatever you're working with)
2. **Agent implementations**
3. **Questions that matter to your use case**

### Repository Structure:

```bash
bash-agent-evals/
├── data/
│   ├── github_issues.json     # Sample dataset
│   └── schema.json            # Data schema
├── agents/
│   ├── sql_agent.py           # Pure SQL approach
│   ├── bash_agent.py          # Bash-only approach
│   ├── fs_agent.py            # Basic filesystem tools
│   └── hybrid_agent.py        # Bash + SQL hybrid
├── evals/
│   ├── questions.json         # Eval questions
│   └── scoring.py             # Accuracy scoring
└── README.md
```

---

## Credits

This post was written by:
- [Ankur Goyal](https://x.com/ankrgyl) and the team at [Braintrust](https://www.braintrust.dev/)

Braintrust builds **evaluation infrastructure for AI applications**.

The eval harness is open source and integrates with [just-bash](https://justbash.dev/) from Vercel.

---

## Key Takeaways

### 1. Bash Has Deep Model Knowledge, But That Doesn't Mean Better Performance

LLMs can generate sophisticated shell commands (chaining `find`, `grep`, `jq`, `awk`, `xargs`), but for structured data queries, SQL was **7x more token-efficient** and **6.5x cheaper**.

### 2. Self-Verification is Valuable

The hybrid approach's tendency to double-check results by querying both SQL and filesystem caught errors that pure SQL missed, achieving **100% consistent accuracy**.

### 3. Evals Need Iteration

Over **200 messages** and **hundreds of traces**:
- Fixed performance bottlenecks
- Corrected wrong expected answers
- Found data loading bugs
- Improved both tools and benchmarks

### 4. The Right Abstraction Depends on the Task

```
Structured data + clear schema → SQL
Exploration + unknown schema   → Bash
High-stakes + critical accuracy → Hybrid (Bash + SQL)
```

### 5. Cost-Accuracy Tradeoff is Real

```
SQL:    100% speed, ~95% accuracy, 1x cost
Hybrid: ~40% speed, 100% accuracy, 2x cost
```

For production systems, **2x cost for guaranteed accuracy** is often worth it.

---

## Visual Assets

All screenshots saved in: `extracted_content/Important Articles/Fintool/screenshots/`

1. **vercel-bash-full.png** - Full page screenshot
2. **vercel-bash-tweet.png** - Arpit Bhayani's tweet on filesystems in AI
3. **vercel-bash-shell-scripting.png** - Sophisticated shell scripting example
4. **vercel-bash-hybrid-comparison.png** - Hybrid approach comparison chart

---

## Strategic Implications for Sunder

### For RE-AI-CRM Agent Architecture:

**1. Data Query Layer:**
- Use **SQL** for structured CRM data queries (contacts, companies, campaigns)
- Use **bash/filesystem** for exploring unstructured content (email threads, call transcripts)
- Consider **hybrid** for high-stakes personalization (outreach generation must be accurate)

**2. Self-Verification Pattern:**
```python
# Hybrid approach for outreach personalization:
1. Query CRM database for prospect data (SQL)
2. Grep through call transcripts for insights (bash)
3. Cross-verify signals from both sources
4. Generate personalized outreach with high confidence
```

**3. Cost-Accuracy Decision:**
- Research tasks: Use cheaper bash-only approach
- Outreach generation: Use hybrid for 100% accuracy (worth 2x cost)
- Analytics queries: Use pure SQL for speed

**4. Filesystem as Context Layer:**
- Map agent memory to filesystem
- Let agents grep through past interactions
- Enable self-verification of research quality

### For Agent Evaluation:

**Key Lesson:** Build evals with **detailed traces** from day one.

Braintrust and Vercel's back-and-forth caught:
- Performance bottlenecks
- Wrong expected answers
- Data loading bugs
- Scoring issues

**Without trace visibility, we'd be optimizing for flawed benchmarks.**

---

## Related Research

**Tools Referenced:**
- [just-bash](https://justbash.dev/) - Vercel's bash tool for AI agents
- [Braintrust](https://www.braintrust.dev/) - Eval infrastructure for AI apps
- [bash-agent-evals](https://github.com/braintrustdata/bash-agent-evals) - Open source eval harness

**Related Vercel Posts:**
- [How to Build Agents with Filesystems and Bash](https://vercel.com/blog/how-to-build-agents-with-filesystems-and-bash)

**Community Discussion:**
- [Arpit Bhayani on Twitter](https://x.com/arpit_bhayani/status/2010923602561077702) - Filesystems as next big thing in AI

---

## Tags

`#bash` `#sql` `#agent-architecture` `#evals` `#benchmarks` `#self-verification` `#hybrid-approach` `#structured-data` `#filesystem-abstraction` `#llm-agents` `#cost-accuracy-tradeoff` `#braintrust` `#vercel` `#just-bash` `#agent-design`

---

**Published:** January 22, 2026
**Authors:** Ankur Goyal (Braintrust), Andrew Qu (Vercel)
**Extracted:** February 11, 2026
