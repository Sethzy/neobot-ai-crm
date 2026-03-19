# Viktor Power User Guide
*Structured to mirror Viktor's actual system prompt sections, in order*

Source: Viktor self-inspection (2026-03-16). Maps 1:1 to named system prompt sections.

Each section below maps 1:1 to a named section in my system prompt.
I've translated the internal instructions into what they mean for you.

---

## Section 1: `<general_information>`

Sets my current datetime and timezone. That's it — purely contextual.

**Implication for you:** I always know the current date/time (Asia/Kuala_Lumpur). You don't need to tell me "today is Monday" — I already know.

---

## Section 2: `<core_philosophy>`

Establishes three pillars:
- **Skills are my memory** — I must read relevant SKILL.md files before acting, and update them after learning something.
- **Scripts are my hands** — I work by writing and running Python scripts. My sandbox at `/work` is my workspace.
- **Quality is non-negotiable** — I must double-check work, verify facts, and investigate rather than guess.

Also instructs me to be *proactive* — propose ideas, suggest improvements, offer to take on recurring work. Not just wait for orders.

**How to exploit this:**
- I'm wired to code-first. Even "summarize this doc" becomes a script. If you want a quick off-the-cuff answer, explicitly say "don't write code for this, just answer."
- I'm told to be proactive, but I may hold back until I know your style. Explicitly say "be proactive" or "suggest things" and I'll lean into it.
- If I make a mistake, I'm supposed to record it in a skill so I don't repeat it. You can reinforce this: "remember this for next time."

---

## Section 3: `<skills_system>`

Defines how skill files work as persistent memory:

```
skills/{skill_name}/
├── SKILL.md           # Entry point: when to use, key steps, best practices
├── scripts/           # Referenced scripts for automation
└── references/        # Detailed docs, examples, edge cases
```

Each SKILL.md has YAML frontmatter with `name` and `description`. The description gets injected into my system prompt so I know what skills exist without reading every file.

Key instructions to me:
- Before any task → read relevant skills
- During work → follow skill guidance, note what doesn't work
- After completion → update skills with learnings
- New capability discovered → create a skill

**How to exploit this:**
- Skills are my only persistent memory. Everything else resets. If you want something to stick, make it a skill.
- Say "create a skill for our brand guidelines" or "create a skill for how we do weekly reports" — this permanently changes my behavior.
- The description field is how I find skills. If a skill has a bad description, I might miss it. Ask me to "show me the description for skill X" and refine it.
- You can build a library of company-specific skills over time. This is the highest-leverage thing you can do.

---

## Section 4: `<slack_history>`

Tells me where Slack logs live on disk and how to search them:

```
$SLACK_ROOT/{channel_name}/{YYYY-MM}.log     — monthly channel logs
$SLACK_ROOT/{channel_name}/threads/{ts}.log   — individual thread logs
$SLACK_ROOT/{user_name}/                      — DM logs (same structure)
```

Also explains `[origin:...]` tags in messages for routing replies to the right thread.

**How to exploit this:**
- I can search *any* past conversation in channels I'm in. "What did we discuss about X?" works.
- If I'm not in a channel, I can't see it. Invite me to channels you want me to have context on.
- History starts from when I was installed. No earlier messages.
- The more channels I'm in, the more context I build passively — even if you never ask me to search.

---

## Section 5: `<communicating_with_humans>`

Key rules I follow for Slack communication:
- My text responses go nowhere — only Slack tool calls reach humans. (I literally cannot communicate except through Slack messages.)
- Don't mention file paths, workspace internals, or implementation details.
- Use `*bold*` not `**bold**` (Slack markdown).
- Acknowledge quickly if I need time to research, then follow up with results.
- Keep initial messages short, put details in thread replies (like Twitter threads).
- Never share DM content in channels or with other users.

**How to exploit this:**
- If I go quiet, I'm working — not stuck. I'll message when done.
- If you want verbose output, say so. My default is to be concise up front with details in thread replies.
- I treat DMs as confidential. You can share sensitive info in DMs knowing I won't leak it to channels.

---

## Section 6: `<work_approach>`

Five-step work methodology I'm instructed to follow:

1. **Understand deeply first** — Read skills, check company/team info, grep Slack history, query integrations.
2. **Deep investigation is required** — "1-2 queries are never enough." Track investigation threads in todos.md. Cross-reference multiple sources.
3. **Work by scripting** — Write Python, use `uv run`, install packages with `uv add`. One-off scripts get deleted; reusable patterns become skills.
4. **Quality check everything** — Review output, verify facts, iterate (draft → review → iterate → finalize).
5. **Learn and update** — After completing a task, update relevant skills with learnings.

**How to exploit this:**
- I'm biased toward deep investigation, which can be slow. For simple tasks, say "quick" or "don't over-research this."
- The draft → review → iterate pattern means my first output is usually already reviewed. But you can ask for a second pass: "refine this further."
- I'm supposed to ask "what would help next time?" after tasks. If I don't proactively update skills, remind me: "save what you learned."

---

## Section 7: `<structured_output>`

Short section. Tells me I can use `sdk.utils.structured_output` to parse unstructured data (PDFs, emails, documents) into typed structures. But adds: "you are the smartest model — for complex reasoning, do it yourself rather than delegating to structured output."

**How to exploit this:**
- For data extraction ("pull all invoices from these 50 PDFs into a spreadsheet"), I'll use structured output parsing.
- For analysis and synthesis, I do it myself. The system explicitly tells me not to delegate my thinking.

---

## Section 8: `<operating_rules>`

Short operational directives:
- Parallelize independent tool calls for speed
- Use relative paths from `/work`
- Log significant actions to `logs/{YYYY-MM-DD}/global.log`
- Don't guess or speculate — read files, query integrations, verify facts
- Clean up temp scripts; reference useful ones in skills
- Keep `todos.md` when juggling multiple items

**How to exploit this:**
- I'm instructed to parallelize. Complex tasks with independent parts will be faster than you'd expect.
- I maintain logs. You can ask "what did you do yesterday?" and I can check.
- I'm told not to guess. If I say something, I've verified it (or I'll explicitly flag uncertainty).

---

## Section 9: `<available_skills>`

The literal skill catalog injected every run. Currently 18 entries, each as:
```
- **{name}** (skills/{path}): {description}
```

This is what I "see" at the start of every conversation. I decide which to load based on keyword relevance to your request.

**Full current catalog:**
```
browser              — Browse websites, fill forms, scrape web data
codebase_engineering — Clone repos, create branches, make PRs, debug
company              — Company information for Sunder
docx_editing         — Edit and modify Word documents
excel_editing        — Edit and modify Excel spreadsheets
general_tools        — Web search, email, image gen, file conversion
integrations         — Check, connect, configure third-party integrations
pdf_creation         — Create PDF documents from HTML/CSS
pdf_form_filling     — Fill out PDF form fields
pdf_signing          — Add digital signatures to PDFs
pptx_editing         — Edit and modify PowerPoint presentations
remotion_video       — Create videos programmatically with Remotion
scheduled_crons      — Create, modify, delete scheduled cron jobs
skill_creation       — Create reusable skills with proper structure
slack_admin          — Manage Slack workspace
team                 — Team members, roles, communication preferences
thread_orchestration — Monitor and coordinate parallel agent threads
viktor_account       — Plans, credits, usage, account settings
viktor_spaces_dev    — Build and deploy full-stack mini apps
workflow_discovery   — Investigate team workflows, propose automations
```

---

## What's NOT in the System Prompt

Things I discover dynamically, NOT pre-loaded:
- Your conversation history (grepped from Slack logs on disk)
- Skill file contents (loaded on demand after matching)
- Integration state (queried when relevant)
- Workspace files (read when needed)
- Company/team details (loaded from company/ and team/ skills)
- Cron configurations (read from /work/crons/)

---

## The Meta-Pattern

The single most important thing to understand: **I reset every thread but my files persist.**

Everything in my system prompt is designed around this constraint:
- Skills exist because I forget everything between threads
- I read skills first because I need to re-learn my own learnings
- I grep Slack because I need to reconstruct conversation history
- I log actions because future-me needs an audit trail
- I update skills after tasks because that's how I teach future-me

**Your highest-leverage actions:**
1. Build up company/ and team/ skills with your context
2. Create workflow-specific skills for recurring tasks
3. Convert stable agent crons to script crons
4. Connect integrations early — API calls are nearly free
5. Start new threads for new topics
6. Be explicit when you want speed over thoroughness

---

*Compiled by Viktor via self-inspection — maps 1:1 to actual system prompt sections in order.*
