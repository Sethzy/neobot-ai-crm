# Assembly Pattern References for Agent Orchestration with Sandboxed Execution

Date: 2026-03-23

Scope: open-source repos and documented architectures that most closely match this pattern:

1. outer agent gathers data with lightweight tools
2. outer agent assembles a structured handoff
3. sandbox executes compute or rendering only
4. outer agent receives the result and continues

Ranking bias: exactness of the gather -> assemble -> sandbox boundary mattered more than raw popularity. Star counts and activity below are current as of 2026-03-23.

## 1. E2B Cookbook: Firecrawl scrape and analyze Airbnb data

Links:

- Repo: [e2b-dev/e2b-cookbook](https://github.com/e2b-dev/e2b-cookbook)
- Example: [examples/firecrawl-scrape-and-analyze-airbnb-data](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/firecrawl-scrape-and-analyze-airbnb-data)
- README: [README.md](https://github.com/e2b-dev/e2b-cookbook/blob/main/examples/firecrawl-scrape-and-analyze-airbnb-data/README.md)
- Orchestration: [index.ts](https://github.com/e2b-dev/e2b-cookbook/blob/main/examples/firecrawl-scrape-and-analyze-airbnb-data/index.ts)
- Gathering: [scraping.ts](https://github.com/e2b-dev/e2b-cookbook/blob/main/examples/firecrawl-scrape-and-analyze-airbnb-data/scraping.ts)
- Sandbox execution: [codeInterpreter.ts](https://github.com/e2b-dev/e2b-cookbook/blob/main/examples/firecrawl-scrape-and-analyze-airbnb-data/codeInterpreter.ts)

1. Repo URL + stars/activity: `e2b-dev/e2b-cookbook`, 1,314 stars, last pushed 2026-01-29, updated 2026-03-23. Maintained and directly relevant.
2. Architecture flow: Firecrawl scrapes Airbnb listing pages and returns structured listing data. The outer script saves and parses that JSON, injects it into an Anthropic prompt, the model emits a tool call for `execute_python`, and E2B runs the analysis code to produce a histogram PNG.
3. What runs outside the sandbox: all web gathering. `scrapeAirbnb()` extracts pagination links with one schema, then listing objects with another schema, writes `airbnb_listings.json`, and the outer process builds the analysis request.
4. What runs inside the sandbox: only analysis and rendering. E2B `Sandbox.runCode()` executes the generated Python and returns logs plus rich cell results, including the chart image.
5. Interface between the two: the handoff is explicit and structured twice. First, Firecrawl returns structured JSON listings. Second, the model calls the sandbox tool with a payload shaped like `{"code": "..."}`. The sandbox receives code only, not crawling instructions.
6. How errors propagate: scraping throws and aborts the outer flow. Sandbox runtime errors are checked via `exec.error`; if present, the outer loop logs the runtime failure and stops instead of pretending the analysis succeeded.
7. How context is managed: the model sees the scraped listing data in the prompt. The sandbox returns logs and cell results; the outer app uses those results and saves the PNG artifact, rather than replaying an entire sandbox session transcript.
8. Cost/performance notes: this is a strong cost pattern because Firecrawl does the network-heavy extraction once and the sandbox is used only for analysis. The obvious tradeoff is prompt bloat if the scraped JSON grows too large.

## 2. GAIA Agent SDK

Links:

- Repo: [gaia-agent/gaia-agent](https://github.com/gaia-agent/gaia-agent)
- README: [README.md](https://github.com/gaia-agent/gaia-agent/blob/main/README.md)
- Main agent: [src/agent.ts](https://github.com/gaia-agent/gaia-agent/blob/main/src/agent.ts)
- Default tools: [src/config/tools.ts](https://github.com/gaia-agent/gaia-agent/blob/main/src/config/tools.ts)
- Search provider: [src/tools/search/tavily.ts](https://github.com/gaia-agent/gaia-agent/blob/main/src/tools/search/tavily.ts)
- Browser provider: [src/tools/browser/browseruse.ts](https://github.com/gaia-agent/gaia-agent/blob/main/src/tools/browser/browseruse.ts)
- Sandbox provider: [src/tools/sandbox/e2b.ts](https://github.com/gaia-agent/gaia-agent/blob/main/src/tools/sandbox/e2b.ts)
- ReAct docs: [docs/react-planning.md](https://github.com/gaia-agent/gaia-agent/blob/main/docs/react-planning.md)

1. Repo URL + stars/activity: `gaia-agent/gaia-agent`, 13 stars, last pushed 2025-12-31, updated 2026-02-06. Low adoption, but the architecture is unusually explicit.
2. Architecture flow: `GAIAAgent` extends AI SDK v6 `ToolLoopAgent`. The outer loop uses planning, search, browser, and memory tools to gather facts, then calls a distinct sandbox tool when computation is needed, and finally uses a verifier before answering.
3. What runs outside the sandbox: planning, Tavily or Exa search, BrowserUse or Steel browser automation, HTTP requests, memory tracking, and verification all run as normal tools outside the sandbox boundary.
4. What runs inside the sandbox: only `e2bSandbox` or `sandockExecute`. The E2B provider creates a sandbox, runs Python, JavaScript, or Bash, captures stdout and stderr, and kills the sandbox in `finally`.
5. Interface between the two: the handoff is strongly typed. Search takes query objects, browser takes a task string, and sandbox takes a structured payload with `language` and `code`. This is the cleanest “tool result -> assembled execution payload” interface in the set.
6. How errors propagate: each provider returns `{ success: false, error }` instead of throwing deep into the loop. That lets the outer ToolLoopAgent recover and choose a different action.
7. How context is managed: tool results become observations in the ToolLoopAgent loop. The sandbox output returned to the model is already narrowed to stdout, stderr, and exit code, not a full shell transcript.
8. Cost/performance notes: clean separation, but the current E2B implementation creates a fresh sandbox per execution. That keeps isolation simple, but repeated compute-heavy steps will pay cold-start overhead.

## 3. Modal Example: LangGraph code agent with Modal sandbox

Links:

- Repo: [modal-labs/modal-examples](https://github.com/modal-labs/modal-examples)
- Example README: [13_sandboxes/codelangchain/README.md](https://github.com/modal-labs/modal-examples/blob/main/13_sandboxes/codelangchain/README.md)
- Main agent: [13_sandboxes/codelangchain/agent.py](https://github.com/modal-labs/modal-examples/blob/main/13_sandboxes/codelangchain/agent.py)
- Retrieval: [13_sandboxes/codelangchain/src/retrieval.py](https://github.com/modal-labs/modal-examples/blob/main/13_sandboxes/codelangchain/src/retrieval.py)
- Nodes: [13_sandboxes/codelangchain/src/nodes.py](https://github.com/modal-labs/modal-examples/blob/main/13_sandboxes/codelangchain/src/nodes.py)
- Edges: [13_sandboxes/codelangchain/src/edges.py](https://github.com/modal-labs/modal-examples/blob/main/13_sandboxes/codelangchain/src/edges.py)

1. Repo URL + stars/activity: `modal-labs/modal-examples`, 1,140 stars, last pushed 2026-03-17, updated 2026-03-20. Maintained and backed by Modal.
2. Architecture flow: the outer agent retrieves and concatenates docs from the Transformers site, injects that context into a LangGraph state machine, generates code, executes it in a Modal sandbox, evaluates the execution result, and retries up to three times before finishing.
3. What runs outside the sandbox: doc retrieval and prompt assembly. `retrieve_docs()` crawls and concatenates documentation, and the LangGraph nodes and edges manage generation, retry control, and evaluation.
4. What runs inside the sandbox: only generated code. `create_sandbox()` provisions the isolated runtime, `run()` executes the candidate code via `python -c`, and the sandbox is terminated at the end.
5. Interface between the two: the outer graph hands off a generated code bundle with separate `prefix`, `imports`, and `code` fields. The actual sandbox payload is the assembled script string passed into `run(code_block, sandbox)`.
6. How errors propagate: import and execution failures are captured into graph state as `error`, then fed back into the generation node. The `evaluate_execution` node decides `finish` or `retry`, and the graph hard-stops after three iterations.
7. How context is managed: the outer graph keeps the retrieved docs, generated code, output, and error in state. The final user-visible answer is not raw sandbox logs alone; it is the generated explanation plus code plus `Result of code execution`.
8. Cost/performance notes: good separation, but retrieval can create a large prompt and the default sandbox uses a T4 GPU image for the demo, which is more expensive than most analysis-only workloads need.

## 4. E2B Fragments

Links:

- Repo: [e2b-dev/fragments](https://github.com/e2b-dev/fragments)
- README: [README.md](https://github.com/e2b-dev/fragments/blob/main/README.md)
- Chat route: [app/api/chat/route.ts](https://github.com/e2b-dev/fragments/blob/main/app/api/chat/route.ts)
- Sandbox route: [app/api/sandbox/route.ts](https://github.com/e2b-dev/fragments/blob/main/app/api/sandbox/route.ts)
- Schema: [lib/schema.ts](https://github.com/e2b-dev/fragments/blob/main/lib/schema.ts)
- Templates: [lib/templates.ts](https://github.com/e2b-dev/fragments/blob/main/lib/templates.ts)

1. Repo URL + stars/activity: `e2b-dev/fragments`, 6,217 stars, last pushed 2026-03-17, updated 2026-03-23. Clearly maintained and widely referenced.
2. Architecture flow: the outer chat route uses `streamObject()` to generate a structured `FragmentSchema`. That schema is then posted to a separate sandbox route, which creates the right template, installs extra dependencies, writes files, and either runs code or serves a live app URL.
3. What runs outside the sandbox: all orchestration. The model selection, chat history, schema validation, template choice, dependency planning, and object generation happen before the sandbox is touched.
4. What runs inside the sandbox: package installation, filesystem writes, notebook-style code execution, or app hosting. The sandbox is purely the render and execution engine.
5. Interface between the two: this is the cleanest structured handoff in the set. `FragmentSchema` includes `template`, `additional_dependencies`, `install_dependencies_command`, `port`, `file_path`, and `code`. The sandbox receives a data bundle, not an open-ended natural-language task.
6. How errors propagate: outer generation uses `maxRetries: 0`, so failures surface immediately. The sandbox returns `stdout`, `stderr`, `runtimeError`, and `cellResults` for interpreter runs, which lets the caller decide how to recover.
7. How context is managed: the outer model sees chat messages and emits a compact schema object. For interpreter runs it gets rich execution results back; for hosted app runs it gets only a sandbox URL, which keeps the context window smaller.
8. Cost/performance notes: efficient when you want artifact generation or rendering, because the model does planning once and the sandbox does the heavy work. The tradeoff is that non-interpreter templates expose only a URL, so automated outer-loop validation is thinner unless you add a follow-up inspection pass.

## 5. Microsoft AutoGen: Magentic-One plus CodeExecutorAgent

Links:

- Repo: [microsoft/autogen](https://github.com/microsoft/autogen)
- Magentic-One docs: [python/docs/src/user-guide/agentchat-user-guide/magentic-one.md](https://github.com/microsoft/autogen/blob/main/python/docs/src/user-guide/agentchat-user-guide/magentic-one.md)
- Company research example: [python/docs/src/user-guide/agentchat-user-guide/examples/company-research.ipynb](https://github.com/microsoft/autogen/blob/main/python/docs/src/user-guide/agentchat-user-guide/examples/company-research.ipynb)
- Code execution pattern: [python/docs/src/user-guide/core-user-guide/design-patterns/code-execution-groupchat.ipynb](https://github.com/microsoft/autogen/blob/main/python/docs/src/user-guide/core-user-guide/design-patterns/code-execution-groupchat.ipynb)
- CodeExecutorAgent: [python/packages/autogen-agentchat/src/autogen_agentchat/agents/_code_executor_agent.py](https://github.com/microsoft/autogen/blob/main/python/packages/autogen-agentchat/src/autogen_agentchat/agents/_code_executor_agent.py)
- Docker executor: [python/packages/autogen-ext/src/autogen_ext/code_executors/docker/_docker_code_executor.py](https://github.com/microsoft/autogen/blob/main/python/packages/autogen-ext/src/autogen_ext/code_executors/docker/_docker_code_executor.py)

1. Repo URL + stars/activity: `microsoft/autogen`, 56,044 stars, last pushed 2026-03-21, updated 2026-03-23. Very active and maintained.
2. Architecture flow: Magentic-One uses an Orchestrator that can delegate to WebSurfer, FileSurfer, Coder, and ComputerTerminal. The closest match to this pattern is: gather facts in WebSurfer or other agents, have Coder assemble executable code, then pass that code to `CodeExecutorAgent` running in Docker.
3. What runs outside the sandbox: planning, browser use, file reading, code generation, and delegation logic. The outer orchestration is explicitly separated from the executor.
4. What runs inside the sandbox: `DockerCommandLineCodeExecutor` runs code blocks in a container. The executor can also expose GPUs and install packages, but it remains the execution boundary rather than the research layer.
5. Interface between the two: the handoff is mostly markdown code blocks or `CodeBlock` objects extracted from messages. Approval hooks use a structured payload, `ApprovalRequest { code, context }`, before execution.
6. How errors propagate: execution output is wrapped and pushed back into model context as a user message, `CodeExecutionEvent` is emitted, and the agent can retry up to `max_retries_on_error`. Non-approved code returns a synthetic execution failure instead of silently skipping.
7. How context is managed: AutoGen keeps execution output in an unbounded chat model context by default, then does a reflection step to turn raw execution results into a final answer. This is powerful, but context growth is the main downside.
8. Cost/performance notes: flexible and production-serious, but it is more “team of agents plus executor” than a strict compiler pipeline. You pay for extra orchestration turns and larger contexts to get that flexibility.

## 6. Vercel Coding Agent Template

Links:

- Repo: [vercel-labs/coding-agent-template](https://github.com/vercel-labs/coding-agent-template)
- README: [README.md](https://github.com/vercel-labs/coding-agent-template/blob/main/README.md)
- Task orchestration: [app/api/tasks/route.ts](https://github.com/vercel-labs/coding-agent-template/blob/main/app/api/tasks/route.ts)
- Sandbox creation: [lib/sandbox/creation.ts](https://github.com/vercel-labs/coding-agent-template/blob/main/lib/sandbox/creation.ts)
- Agent dispatch: [lib/sandbox/agents/index.ts](https://github.com/vercel-labs/coding-agent-template/blob/main/lib/sandbox/agents/index.ts)
- Claude runner: [lib/sandbox/agents/claude.ts](https://github.com/vercel-labs/coding-agent-template/blob/main/lib/sandbox/agents/claude.ts)
- Codex runner: [lib/sandbox/agents/codex.ts](https://github.com/vercel-labs/coding-agent-template/blob/main/lib/sandbox/agents/codex.ts)

1. Repo URL + stars/activity: `vercel-labs/coding-agent-template`, 1,642 stars, last pushed 2026-02-12, updated 2026-03-22. Active and official.
2. Architecture flow: the outer Next.js control plane creates a task, generates branch and commit metadata, provisions a Vercel Sandbox, clones the repo, installs dependencies, injects auth and MCP configuration, runs a coding CLI inside the sandbox, then commits and pushes results.
3. What runs outside the sandbox: task persistence, rate limiting, GitHub auth lookup, branch and title generation, port detection, MCP connector lookup, sandbox lifecycle management, and final status handling.
4. What runs inside the sandbox: repository clone, dependency installation, Claude or Codex CLI execution, optional dev server startup, git add/commit/push, and other heavy repo-local work.
5. Interface between the two: the handoff is a task bundle rather than a typed execution schema: prompt, repo URL, selected agent, selected model, API keys, MCP servers, timeout, and branch metadata. That is usable, but less sharply typed than Fragments or GAIA.
6. How errors propagate: the outer route races the task against a hard timeout, logs sandbox creation errors explicitly, preserves logs in real time, and marks push failures or agent failures on the task. `keepAlive` can preserve the sandbox after failure for follow-up debugging.
7. How context is managed: the outer app stores user messages, agent responses, and logs, but the semantic reasoning still mostly happens inside the sandboxed CLI agent. That makes this a partial pattern match rather than a pure outer-planner / inner-executor split.
8. Cost/performance notes: the configurable sandbox lifetime is useful for long coding tasks, but this is the heaviest operational model in the list. It is best when you want persistent, repo-attached execution, not lightweight post-processing.

## Excluded After Review

- [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands): impressive and active, but the runtime, browser, shell, and most tool use live inside the same sandboxed runtime. That is closer to “sandbox does everything” than the pattern you asked for.
- [langchain-ai/langchain-sandbox](https://github.com/langchain-ai/langchain-sandbox): relevant building block, but archived and explicitly marked unmaintained. It is more a sandbox primitive than a full reference architecture.
- [mastra-ai/mastra](https://github.com/mastra-ai/mastra): strong workspace search and sandbox primitives, but I did not find a canonical repo example that cleanly demonstrates gather -> assemble -> sandbox as one reference implementation.
- [anthropics/claude-cookbooks](https://github.com/anthropics/claude-cookbooks): useful tool-use patterns, but no equally strong isolated execution boundary in the examples I checked.

## Bottom Line

If you want the closest open-source matches to the exact pattern, start with:

1. E2B Cookbook Firecrawl example for scrape -> structured data -> sandbox analysis.
2. GAIA Agent SDK for clean separation of search, browser, and sandbox providers under one outer tool loop.
3. Modal codelangchain for a graph-based “retrieve context outside, execute code inside” implementation.

If your interest is artifact generation rather than research, E2B Fragments is the best payload-to-sandbox reference. If your interest is coding-agent infrastructure, Vercel's template is useful, but it is a looser match because the sandboxed CLI still owns a lot of the reasoning.
