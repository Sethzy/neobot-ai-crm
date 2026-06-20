# Agent Execution Is the New HTTP Request

**Author:** Igor Zalutski (@IgorZIJ)
**Date:** March 19, 2026
**Source:** https://x.com/IgorZIJ/status/2034368877052727683
**Part 2 of:** [The Agentic Workload](./the-agentic-workload-igor-zalutski.md)

## Summary

Agent sessions are the "HTTP request" of the AI era — a new fundamental unit of work that will drive infrastructure evolution the same way HTTP requests shaped 30 years of web server design. The current "messy" CLI-based, file-and-bash agent pattern will stick around despite being theoretically suboptimal, just like HTTP, JavaScript, and TCP/IP won over technically superior alternatives.

## Key Points

### 1. A 30-year history of the HTTP request in 5 minutes

Traces web server evolution through clear bottleneck-driven stages:
- **Files & scripts (early 90s):** HTTPd mapped URLs to files. CGI forked a new OS process per request (Perl scripts). Each request isolated at process level; filesystem shared.
- **Application servers (late 90s–2000s):** Apache, mod_php, Java Servlets, Rails, Django. Traded process-per-request isolation for efficiency — long-lived worker processes sharing memory. Built GitHub, Twitter, Instagram.
- **Shared-nothing / cloud (2006+):** AWS S3/EC2 separated storage from compute. Stateless microservices in containers (Docker, K8s). Each step added reliability nines by removing shared state.
- **Serverless:** Isolated environment per request, recycled after use. Maximum reliability, minimum idle resources. "Scalability solved."

### 2. Agents reset us back to ground zero

- Leading agent harnesses (Claude Code, Codex) read/write files and use bash — just like 1993 CGI scripts.
- LLMs "want" to live in stateful Linux environments because that's what they were trained on.
- MCP is (was?) a stateful protocol.
- The entire serverless/stateless progression gets unwound because agents need persistent filesystem state within a session.

### 3. Agent execution = the new HTTP request

- In web servers, the unit of work is a **request**. In agents, it's the **execution/session/thread**.
- Chat-based interaction pattern (messages grouped into conversations) is here to stay — it emerged from how LLMs were post-trained on human dialogs.

### 4. Don't fight the "wrong" design — it already won

- The current agent architecture (CLI + sandbox + files) may seem suboptimal, but it will persist — just like:
  - HTTP beat CORBA (technically superior)
  - TCP/IP beat ATM
  - JavaScript beat every "better" alternative
- First-mover network effects dwarf technical merit for once-in-a-generation shifts.
- The "agent inside sandbox" pattern won over "sandbox as tool" — not because it's better, but because that's how CLI agents happened.

### 5. Implication for builders

- Don't try to rethink from first principles. Build on what exists.
- Run your agent inside a sandbox. Embrace the imperfections.
- Agent infra will evolve incrementally (like web servers did over 30 years), likely faster but without skipping steps.

## Relevance to Sunder

Sunder's runner architecture (stateless loop + Vercel Functions) sits in the "serverless" paradigm. As we add sandbox execution for skills/subagents (PR 29+, Vercel Sandbox), we're living exactly the transition this article describes — from stateless request handlers to stateful agent sessions that need their own isolated environments.
