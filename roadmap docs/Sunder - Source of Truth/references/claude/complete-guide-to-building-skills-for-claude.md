# The Complete Guide to Building Skills for Claude

---

## Contents

| Section                      | Page |
| ---------------------------- | ---- |
| Introduction                 | 3    |
| Fundamentals                 | 4    |
| Planning and design          | 7    |
| Testing and iteration        | 14   |
| Distribution and sharing     | 18   |
| Patterns and troubleshooting | 21   |
| Resources and references     | 28   |

---

## Introduction

A skill is a set of instructions—packaged as a simple folder—that teaches Claude how to handle specific tasks or workflows. Skills are one of the most powerful ways to customize Claude for your specific needs. Instead of re-explaining your preferences, processes, and domain expertise in every conversation, skills let you teach Claude once and benefit every time.

Skills are powerful when you have repeatable workflows: generating frontend designs from specs, conducting research with consistent methodology, creating documents that follow your team's style guide, or orchestrating multi-step processes. They work well with Claude's built-in capabilities like code execution and document creation. For those building MCP integrations, skills add another powerful layer helping turn raw tool access into reliable, optimized workflows.

This guide covers everything you need to know to build effective skills—from planning and structure to testing and distribution. Whether you're building a skill for yourself, your team, or for the community, you'll find practical patterns and real-world examples throughout.

### What you'll learn:

- Technical requirements and best practices for skill structure

- Patterns for standalone skills and MCP-enhanced workflows

- Patterns we've seen work well across different use cases

- How to test, iterate, and distribute your skills

### Who this is for:

- Developers who want Claude to follow specific workflows consistently

- Power users who want Claude to follow specific workflows

- Teams looking to standardize how Claude works across their organization

### Two Paths Through This Guide

- **Building standalone skills?** Focus on Fundamentals, Planning and Design, and categories 1-2.

- **Enhancing an MCP integration?** The "Skills + MCP" section and category 3 are for you.

Both paths share the same technical requirements, but you choose what's relevant to your use case.

> **What you'll get out of this guide:** By the end, you'll be able to build a functional skill in a single sitting. Expect about 15-30 minutes to build and test your first working skill using the `skill-creator`. Let's get started.

---

## Chapter 1: Fundamentals

### What is a skill?

A skill is a folder containing:

- `SKILL.md` (required): Instructions in Markdown with YAML frontmatter

- `scripts/` (optional): Executable code (Python, Bash, etc.)

- `references/` (optional): Documentation loaded as needed

- `assets/` (optional): Templates, fonts, icons used in output

### Core design principles

#### Progressive Disclosure

Skills use a three-level system:

1.  **First level (YAML frontmatter):** Always loaded in Claude's system prompt. It provides just enough information for Claude to know when each skill should be used without loading all of it into context.

2.  **Second level (SKILL.md body):** Loaded when Claude thinks the skill is relevant to the current task. It contains the full instructions and guidance.

3.  **Third level (Linked files):** Additional files bundled within the skill directory that Claude can choose to navigate and discover only as needed.

> This progressive disclosure minimizes token usage while maintaining specialized expertise.

#### Composability

Claude can load multiple skills simultaneously. Your skill should work well alongside others, not assume it is the only capability available.

#### Portability

Skills work identically across Claude.ai, Claude Code, and the API. Create a skill once and it works across all surfaces without modification, provided the environment supports any dependencies the skill requires.

### For MCP Builders: Skills + Connectors

Building standalone skills without MCP? Skip to Planning and Design—you can always return here later. If you already have a working MCP server, you've done the hard part. Skills are the knowledge layer on top—capturing the workflows and best practices you already know, so Claude can apply them consistently.

#### The kitchen analogy

- **MCP** provides the professional kitchen: access to tools, ingredients, and equipment.

- **Skills** provide the recipes: step-by-step instructions on how to create something valuable.

Together, they enable users to accomplish complex tasks without needing to figure out every step themselves.

| MCP (Connectivity)                                            | Skills (Knowledge)                                 |
| ------------------------------------------------------------- | -------------------------------------------------- |
| Connects Claude to your service (Notion, Asana, Linear, etc.) | Teaches Claude how to use your service effectively |
| Provides real-time data access and tool invocation            | Captures workflows and best practices              |
| What Claude can do                                            | How Claude should do it                            |

#### Why this matters for your MCP users

**Without skills:**

- Users connect your MCP but don't know what to do next.

- Support tickets asking "how do I do X with your integration".

- Each conversation starts from scratch.

- Inconsistent results because users prompt differently each time.

- Users blame your connector when the real issue is workflow guidance.

**With skills:**

- Pre-built workflows activate automatically when needed.

- Consistent, reliable tool usage.

- Best practices embedded in every interaction.

- Lower learning curve for your integration.

---

## Chapter 2: Planning and design

### Start with use cases

Before writing any code, identify 2-3 concrete use cases your skill should enable.

**Good use case definition:**

- **Use Case:** Project Sprint Planning

- **Trigger:** User says "help me plan this sprint" or "create sprint tasks"

- **Steps:**

1. Fetch current project status from Linear (via MCP).

2. Analyze team velocity and capacity.

3. Suggest task prioritization.

4. Create tasks in Linear with proper labels and estimates.

- **Result:** Fully planned sprint with tasks created.

**Ask yourself:**

- What does a user want to accomplish?

- What multi-step workflows does this require?

- Which tools are needed (built-in or MCP)?

- What domain knowledge or best practices should be embedded?

### Common skill use case categories

At Anthropic, we've observed three common use cases:

**Category 1: Document & Asset Creation**

- **Used for:** Creating consistent, high-quality output including documents, presentations, apps, designs, code, etc.

- **Real example:** `frontend-design` skill.

- **Key techniques:** Embedded style guides, template structures, quality checklists, and using Claude's built-in capabilities.

**Category 2: Workflow Automation**

- **Used for:** Multi-step processes that benefit from consistent methodology, including coordination across multiple MCP servers.

- **Real example:** `skill-creator` skill.

- **Key techniques:** Step-by-step workflow with validation gates, templates, built-in review, and iterative refinement loops.

**Category 3: MCP Enhancement**

- **Used for:** Workflow guidance to enhance the tool access an MCP server provides.

- **Real example:** `sentry-code-review` skill.

- **Key techniques:** Coordinates multiple MCP calls, embeds domain expertise, provides context, and handles errors.

### Define success criteria

How will you know your skill is working? These are aspirational targets and rough benchmarks.

**Quantitative metrics:**

- Skill triggers on 90% of relevant queries.

- Completes workflow in X tool calls.

- 0 failed API calls per workflow.

**Qualitative metrics:**

- Users don't need to prompt Claude about next steps.

- Workflows complete without user correction.

- Consistent results across sessions.

### Technical requirements

#### File structure

```text
your-skill-name/          # Skill folder
├── SKILL.md              # Required: main skill file
├── scripts/              # Optional: executable code
│   ├── process_data.py
│   └── validate.sh
├── references/           # Optional: documentation
│   ├── api-guide.md
│   └── examples/
├── assets/               # Optional: templates, etc.
│   └── report-template.md

```

#### YAML frontmatter: The most important part

The YAML frontmatter is how Claude decides whether to load your skill.

**Minimal required format:**

```yaml
name: your-skill-name
description: What it does. Use when user asks to [specific phrases].
```

#### Critical rules

- **SKILL.md naming:** Must be exactly `SKILL.md` (case-sensitive). No variations like `skill.md` are accepted.

- **Skill folder naming:** Use `kebab-case` only. No spaces, underscores, or capitals.

- **No README.md:** Don't include `README.md` inside your skill folder. All documentation goes in `SKILL.md` or `references/`.

#### Field requirements

- **name (required):** `kebab-case` only; no spaces or capitals; should match folder name.

- **description (required):** Must include WHAT the skill does and WHEN to use it (trigger conditions). It must be under 1024 characters and contain no XML tags.

**Optional fields:**

- **license:** Use if making open source (e.g., MIT).

- **compatibility:** 1-500 characters indicating environment requirements.

- **metadata:** Custom key-value pairs (e.g., author, version).

#### Security restrictions

- **Forbidden in frontmatter:** XML angle brackets (`< >`) and skills with "claude" or "anthropic" in the name.

- **Why:** Frontmatter appears in Claude's system prompt; malicious content could inject instructions.

### Writing effective skills

#### The description field

This metadata provides just enough information for Claude to know when a skill should be used without loading it all into context.

**Structure:** [What it does] + [When to use it] + [Key capabilities].

**Good Example:**

> `description: Manages Linear project workflows including sprint planning, task creation, and status tracking. Use when user mentions "sprint", "Linear tasks", "project planning", or asks to "create tickets".`

**Bad Example:**

> `description: Helps with projects.` (Too vague)

#### Writing the main instructions

After the frontmatter, write the actual instructions in Markdown.

**Recommended structure:**

1.  `# Your Skill Name`

2.  `## Instructions`

3.  `### Step 1: [First Major Step]`

4.  `Examples`

5.  `Troubleshooting`

#### Best Practices for Instructions

- **Be Specific and Actionable:** Use clear commands like "Run python scripts/validate.py".

- **Reference Resources Clearly:** Tell Claude exactly where to look (e.g., `references/api-patterns.md`).

- **Use Progressive Disclosure:** Keep `SKILL.md` focused on core instructions and move details to `references/`.

- **Include Error Handling:** Provide a "Common Issues" section with clear solutions.

---

## Chapter 3: Testing and iteration

Skills can be tested at varying levels of rigor:

- **Manual testing in Claude.ai:** Run queries directly. Fast iteration.

- **Scripted testing in Claude Code:** Automate test cases for repeatability.

- **Programmatic testing via skills API:** Build evaluation suites for systematic testing.

> **Pro Tip:** Iterate on a single task until Claude succeeds, then extract that winning approach into a skill.

### Recommended Testing Approach

1.  **Triggering tests:** Ensure the skill loads on obvious tasks and paraphrased requests, and NOT on unrelated topics.

2.  **Functional tests:** Verify correct outputs are generated and API calls succeed.

3.  **Performance comparison:** Prove the skill improves results (e.g., fewer tokens, fewer messages) vs. a baseline.

### Using the skill-creator skill

The `skill-creator` skill helps you build and iterate. It can generate properly formatted `SKILL.md` files, suggest trigger phrases, and review your skill for common issues.

> **To use:** "Use the skill-creator skill to help me build a skill for [your use case]".

### Iteration based on feedback

- **Undertriggering:** Skill doesn't load when it should. **Solution:** Add more detail and keywords to the description.

- **Execution issues:** Inconsistent results. **Solution:** Improve instructions or add error handling.

- **Overtriggering:** Skill loads for irrelevant queries. **Solution:** Add negative triggers and be more specific.

---

## Chapter 4: Distribution and sharing

Skills make your MCP integration more complete and offer a faster path to value.

### Current distribution model (January 2026)

**For individual users:**

1. Download the skill folder.

2. Zip the folder if needed.

3. Upload to Claude.ai via **Settings > Capabilities > Skills**.

4. Or place it in the Claude Code skills directory.

**Organization-level:** Admins can deploy skills workspace-wide (shipped Dec 18, 2025).

### An open standard

Agent Skills is an open standard. The same skill should work whether you're using Claude or other AI platforms.

### Using skills via API

For programmatic use, the API provides direct control.

- `/v1/skills` endpoint for management.

- `container.skills` parameter for Message API requests.

- Requires the **Code Execution Tool beta** to run.

### Recommended approach today

1.  **Host on GitHub:** Use a public repo with a clear README for humans.

2.  **Document in Your MCP Repo:** Link to the skill from your MCP documentation.

3.  **Positioning your skill:** Focus on outcomes (e.g., "set up workspaces in seconds") rather than technical features.

---

## Chapter 5: Patterns and troubleshooting

### Choosing your approach

- **Problem-first:** "I need to fix a kitchen cabinet." The skill handles the tools to achieve the outcome.

- **Tool-first:** "I have Notion MCP." The skill provides expertise on how to use that tool optimally.

### Patterns

1.  **Sequential workflow orchestration:** For multi-step processes in a specific order (e.g., Onboard New Customer).

2.  **Multi-MCP coordination:** For workflows spanning multiple services like Figma, Drive, and Slack.

3.  **Iterative refinement:** For outputs that improve with loops and validation (e.g., Report generation).

4.  **Context-aware tool selection:** For choosing different tools depending on file size or type.

5.  **Domain-specific intelligence:** For adding specialized knowledge like financial compliance checks.

### Troubleshooting

- **Skill won't upload:** Ensure the file is exactly `SKILL.md` (case-sensitive).

- **Invalid frontmatter:** Check for YAML formatting errors like unclosed quotes or spaces in the name.

- **Instructions not followed:** Keep instructions concise, use bullet points, and put critical info at the top.

- **Large context issues:** If the skill is slow, move detailed docs to `references/` and keep `SKILL.md` under 5,000 words.

---

## Chapter 6: Resources and references

- **Official Documentation:** Anthropic's Best Practices Guide, Skills Documentation, and API Reference.

- **Example skills:** GitHub: `anthropics/skills`.

- **Support:** Claude Developers Discord or GitHub Issues.

### Reference A: Quick checklist

- [ ] Folder named in `kebab-case`.

- [ ] `SKILL.md` file exists with exact spelling.

- [ ] YAML frontmatter has delimiters.

- [ ] Description includes WHAT and WHEN.

- [ ] No XML tags anywhere.

- [ ] Compressed as `.zip` file for upload.

### Reference B: YAML frontmatter

```yaml
name: skill-name-in-kebab-case
description: What it does and when to use it.
license: MIT
metadata:
  author: Company Name
  version: 1.0.0
```

### Reference C: Complete skill examples

Production-ready skills for PDF, DOCX, and XLSX creation are available in the public repositories.
