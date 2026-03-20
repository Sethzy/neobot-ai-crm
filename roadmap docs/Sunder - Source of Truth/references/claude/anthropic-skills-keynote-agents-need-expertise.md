# Anthropic Skills Keynote: Equipping Agents with Expertise

**Source:** https://www.youtube.com/watch?v=CEvIs9y1uog
**Speaker:** Anthropic (official)
**Date:** 2025
**Tags:** skills, agent-architecture, progressive-disclosure, MCP, organizational-memory

---

## Summary

Anthropic's official keynote on why agents need skills — not more agents. The core thesis: intelligence ≠ expertise. A general-purpose agent with a skills library beats many specialized agents. Skills are the "applications" layer of the agent stack.

---

## Key Takeaways (with timestamps)

### (00:14–01:07) Agents are powerful but lack expertise

Modern AI agents are widely used but still have gaps — especially in domain-specific expertise needed for real-world tasks.

### (01:07–01:55) Shift from many agents → one general agent

The original assumption (one agent per domain) is breaking down. Instead, a general-purpose agent can operate across domains using code as a universal interface (APIs, files, scripts).

### (01:55–02:36) Core problem: intelligence ≠ expertise

Agents are like "brilliant generalists" but lack consistent, expert-level execution. They don't naturally retain or apply domain knowledge well.

### (03:01–03:47) Introduction of "skills"

Skills are collections of files (folders) that package reusable procedural knowledge (instructions, scripts, assets).
→ Simple, portable, versionable (e.g., Git, Drive)

### (03:47–04:31) Why skills beat traditional tools

- Tools are static, ambiguous, and stuck in context
- Skills (via code) are modifiable, self-documenting, and reusable
- Agents can store and reuse their own scripts → increasing consistency

### (04:31–04:54) Efficient context usage via progressive loading

Only metadata of skills is loaded initially. Full details are pulled on demand, enabling hundreds/thousands of skills without blowing context limits.

### (05:22–06:41) Types of skills emerging

- **Foundational** — general capabilities
- **Third-party** — integrations like browser automation, Notion
- **Enterprise** — internal workflows, best practices
→ Strong traction especially in large organizations

### (07:35–08:50) Skills ecosystem trends

- Increasing complexity (scripts, binaries, full software)
- Complementing MCP (MCP = connectivity, skills = expertise)
- Non-technical users creating skills (finance, legal, HR)

### (09:14–10:20) Emerging agent architecture

A modern agent stack consists of:

```
Agent loop        (context + reasoning)
Runtime           (filesystem + code execution)
MCP servers       (external tools/data)
Skills library    (on-demand expertise)
```

→ New capabilities = just add MCP + skills

### (10:47–11:38) Future: treat skills like software

Needs:
- Testing & evaluation
- Versioning & lineage
- Dependency management
→ Skills will evolve like real software systems

### (12:03–13:27) Skills enable organizational memory

Skills act as shared procedural knowledge, improving all agents over time.
→ New employees inherit "team intelligence" instantly

### (13:27–14:33) Toward continuous learning agents

Agents can create, refine, and discard skills, making learning persistent and transferable (not just in-context memory).

### (14:33–15:49) Big analogy: skills = applications

```
Models          = processors
Agent runtime   = OS
Skills          = applications
```

→ Real value comes from encoding domain expertise as skills

---

## Bottom Line

- Don't build many specialized agents
- Build skills that encode expertise
- Let a general agent + runtime + MCP + skills handle everything
- This shifts AI from "smart but forgetful" systems → compounding, reusable intelligence

---

## Relevance to Sunder

| Keynote concept | Sunder equivalent |
|---|---|
| One general agent with skills | Sunder's runner + instruction skills (PR 51) |
| Progressive loading (metadata first) | `<available-skills>` block with frontmatter only, `read_file` on demand |
| Skills = folders (instructions + scripts + assets) | SKILL.md in Supabase Storage per client |
| MCP = connectivity, skills = expertise | Composio connections = tools, skills = how to use them |
| Non-technical users creating skills | Users create/edit skills via chat conversation |
| Organizational memory via skills | 7 bundled RE defaults + user customization |
| Skills are temporary, models improve | Design doc notes: "skills are ephemeral" (Fintool) |
| Agent creates/refines/discards skills | Agent writes/edits SKILL.md via `write_file` |
