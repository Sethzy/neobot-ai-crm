# Writing Effective Tools for Agents — With Agents

> Source: https://www.anthropic.com/engineering/writing-tools-for-agents
> Published: Sep 11, 2025

Agents are only as effective as the tools we give them. This article covers how to write high-quality tools and evaluations, and how you can boost performance by using Claude to optimize its tools for itself.

## Key Takeaways

### What Is a Tool?

Tools are a new kind of software reflecting a contract between deterministic systems and non-deterministic agents. Unlike function calls (e.g., `getWeather("NYC")` always fetches NYC weather the same way), an agent given "Should I bring an umbrella today?" might call the weather tool, answer from general knowledge, or ask a clarifying question first. This means we need to design tools **for agents**, not just for developers.

### How to Write Tools

1. **Build a prototype** — Stand up a quick prototype. Wrap tools in a local MCP server or DXT. Test them in Claude Code or the Claude Desktop app.
2. **Run an evaluation** — Measure how well Claude uses your tools by running evals with realistic, complex tasks (not simplistic sandbox scenarios).
3. **Collaborate with agents** — Let agents analyze eval transcripts and improve tools. Claude is an expert at analyzing transcripts and refactoring tools at once.

### Generating Evaluation Tasks

Strong evaluation tasks:
- Are inspired by real-world uses with realistic data
- May require multiple tool calls (potentially dozens)
- Example: "Schedule a meeting with Jane next week to discuss our latest Acme Corp project. Attach the notes from our last project planning meeting and reserve a conference room."

Weak evaluation tasks:
- Are overly simplistic or shallow
- Example: "Schedule a meeting with jane@acme.corp next week."

### Principles for Writing Effective Tools

#### 1. Choosing the Right Tools

- More tools don't always lead to better outcomes
- Don't just wrap existing API endpoints — agents have different affordances than traditional software
- Build a few thoughtful tools targeting specific high-impact workflows
- Tools can consolidate functionality, handling multiple discrete operations under the hood

Examples:
- Instead of `list_users`, `list_events`, and `create_event` → implement `schedule_event` (finds availability and schedules)
- Instead of `read_logs` → implement `search_logs` (returns only relevant lines + context)
- Instead of `get_customer_by_id`, `list_transactions`, `list_notes` → implement `get_customer_context` (compiles all relevant info at once)

#### 2. Namespacing Tools

- Group related tools under common prefixes (e.g., `asana_search`, `jira_search`)
- Namespace by service and resource (e.g., `asana_projects_search`, `asana_users_search`)
- Prefix- vs. suffix-based namespacing has non-trivial effects — test with your own evals

#### 3. Returning Meaningful Context

- Return only high-signal information
- Prioritize contextual relevance over flexibility
- Eschew low-level technical identifiers (e.g., `uuid`, `256px_image_url`, `mime_type`) — prefer `name`, `image_url`, `file_type`
- Resolve arbitrary alphanumeric UUIDs to semantically meaningful language (or 0-indexed IDs) to reduce hallucinations
- Consider a `response_format` enum (`"concise"` vs. `"detailed"`) to let agents control verbosity

#### 4. Optimizing for Token Efficiency

- Implement pagination, range selection, filtering, and/or truncation with sensible defaults
- Claude Code restricts tool responses to 25,000 tokens by default
- Steer agents with helpful instructions on truncated responses
- Make error responses specific and actionable (not opaque error codes or tracebacks)

#### 5. Prompt-Engineering Tool Descriptions

- Think of how you'd describe the tool to a new hire on your team
- Make implicit context explicit (specialized query formats, niche terminology, resource relationships)
- Avoid ambiguity — clearly describe expected inputs and outputs
- Use unambiguous parameter names (`user_id` not `user`)
- Even small refinements to descriptions can yield dramatic improvements (Claude Sonnet 3.5 achieved SOTA on SWE-bench Verified through precise description refinements)

### Key Metrics to Track

- Top-level accuracy
- Total runtime of individual tool calls and tasks
- Total number of tool calls
- Total token consumption
- Tool errors
- Common workflows agents pursue

### Analyzing Results

- Observe where agents get stumped or confused
- Read reasoning/feedback/CoT to identify rough edges
- Review raw transcripts (tool calls + responses) for behavior not described in CoT
- What agents **omit** can be more important than what they include
- Lots of redundant tool calls → rightsize pagination/token limits
- Lots of invalid parameter errors → clearer descriptions/better examples needed
