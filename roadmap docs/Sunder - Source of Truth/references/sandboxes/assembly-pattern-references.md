# Assembly Pattern — Reference Implementations

> **Last updated:** 2026-03-23
> **Pattern:** Outer agent gathers data with lightweight tools → assembles structured payload → hands off to sandboxed execution environment for computation/rendering → gets result back. The sandbox does NOT do research — it receives pre-gathered inputs only.

As [Perplexity's Sandbox API announcement](https://www.perplexity.ai/hub/blog/sandbox-api-isolated-code-execution-for-ai-agents) puts it: *"The agent reasons about what to compute. The sandbox computes it."*

[Firecrawl's sandbox guide](https://www.firecrawl.dev/blog/ai-agent-sandbox) formalizes this: *"Separate the thinking environment from the acting environment. LLM API calls and reasoning loops can run on your normal infrastructure. But the actions those reasoning loops produce must execute inside an isolated sandbox."*

---

## 1. Vercel Coding Agent Template

**Repo:** [vercel-labs/coding-agent-template](https://github.com/vercel-labs/coding-agent-template) | 1.6k stars | Active (2026)

**Architecture:**
- **Outside sandbox (Next.js API routes):** Task creation in DB, AI branch name generation via AI SDK + Vercel AI Gateway, user credential gathering (API keys, GitHub tokens), prompt sanitization (stripping backticks, dollar signs), MCP server config decryption, conversation history assembly for follow-ups. Uses `after()` hooks for non-blocking execution.
- **Inside sandbox (Vercel Sandbox):** Repository cloning, dependency installation, agent CLI execution (Claude Code, Codex, Gemini CLI, etc.), `git status --porcelain` to detect changes. Provisioned via `createSandbox()` in `lib/sandbox/creation.ts`.

**Interface/payload:** A `SandboxConfig` object containing `taskId`, `repoUrl`, `githubToken`, `gitAuthorName`, `gitAuthorEmail`, `apiKeys`, `timeout`, `ports`, `runtime`, `resources`, `taskPrompt`, `selectedAgent`, `selectedModel`, `installDependencies`, `keepAlive`, and `preDeterminedBranchName`.

**Error handling:** Real-time output streaming via `TaskLogger`, fallback timestamp-based branch names if AI generation fails, timeout-based sandbox expiry.

**Key insight:** The outer layer does _all_ context assembly (credentials, prompts, MCP configs, conversation history) before the sandbox ever starts. The sandbox is a pure execution environment.

---

## 2. E2B Fragments (formerly AI Artifacts)

**Repo:** [e2b-dev/fragments](https://github.com/e2b-dev/fragments) | 6.2k stars | Active (2026)

**Architecture:**
- **Outside sandbox (Next.js app):** LLM streaming via Vercel AI SDK's `useObject` hook, structured output generation in `FragmentSchema` format, prompt construction via `toPrompt()`, model provider abstraction via `getModelClient()`. The LLM generates a complete `FragmentSchema` object including code, dependencies, template selection, and file paths.
- **Inside sandbox (E2B):** Dependency installation via `install_dependencies_command`, code file writing to sandbox filesystem, code execution via `sbx.runCode()` for interpreters or web server startup for web apps.

**Interface/payload:** `FragmentSchema` (defined in `lib/schema.ts`):
```typescript
{
  commentary: string       // AI explanation
  template: string         // E2B template ID
  title: string
  description: string
  additional_dependencies: string[]
  has_additional_dependencies: boolean
  install_dependencies_command: string
  port: number | null      // for web templates, null for interpreters
  file_path: string        // main file path
  code: string | FileObject[]
}
```
POST'd to `/api/sandbox` along with `userID`, `teamID`, `accessToken`.

**Key insight:** The LLM is constrained to output structured `FragmentSchema` via `streamObject()` — the sandbox never does any reasoning. It receives a fully specified artifact definition and just executes it.

---

## 3. E2B Code Interpreter SDK

**Repo:** [e2b-dev/code-interpreter](https://github.com/e2b-dev/code-interpreter) | 2.3k stars | Last update: Mar 2026

The purest expression of the pattern — a single `runCode()` call:

```typescript
const sandbox = await Sandbox.create()
const execution = await sandbox.runCode(code, { language, context, envs, timeout })
// execution.results: Result[] — each has .text, .html, .markdown, .chart
// execution.logs: { stdout, stderr }
// execution.error: ExecutionError | null
```

Charts from Matplotlib are auto-extracted via `E2BChartFormatter`. DataFrames formatted via `E2BDataFormatter`.

**Key insight:** Code string in, structured `Execution` object out. The SDK internally POSTs to a Jupyter server in the sandbox and streams output lines back.

---

## 4. OpenHands (formerly OpenDevin)

**Repo:** [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands) | 69.6k stars | v1.5.0 (Mar 2026)
**Docs:** [docs.openhands.dev/openhands/usage/architecture/runtime](https://docs.openhands.dev/openhands/usage/architecture/runtime)
**Paper:** [arxiv.org/pdf/2511.03690](https://arxiv.org/pdf/2511.03690)

**Architecture:**
- **Outside sandbox (AgentController):** Planning, reasoning, LLM calls, state management. Generates typed `Action` events based on LLM output.
- **Inside sandbox (ActionExecutionServer in Docker):** Bash execution, file operations, Jupyter/IPython, browser automation. Exposes a RESTful API.

**Interface:** Action/Observation event stream. Actions include `CmdRunAction`, `FileEditAction`, `FileReadAction`, `BrowseURLAction`, `IPythonRunCellAction`. Observations include `CmdOutputObservation`, `FileReadObservation`, `IPythonRunCellObservation`. Communication via HTTP POST to `/execute_action`.

**Data flow:**
1. AgentController reasons → generates Action
2. Action dispatched to Runtime via EventStream
3. Runtime POSTs action to ActionExecutionServer (HTTP) inside Docker
4. Server executes using BashSession, JupyterPlugin, or BrowserEnv
5. Observation returned → added to EventStream
6. AgentController consumes Observation → updates state → loops

**V1 evolution:** Introduces `BaseWorkspace` abstraction with `LocalWorkspace` (in-process, no sandbox) and `RemoteWorkspace` (HTTP delegation to containerized server). Factory `Workspace(...)` resolves based on config. Agent code unchanged across environments.

**Key insight:** Most complex variant — the agent _also_ does research (browsing, file reading) through the sandbox. But the reasoning/execution separation still holds via the typed Action/Observation protocol.

---

## 5. Modal Sandboxes + LangGraph Agent

**Docs:** [modal.com/docs/examples/agent](https://modal.com/docs/examples/agent)

**Architecture:**
- **Outside sandbox (LangGraph graph):** Document retrieval from web via `retrieval.retrieve_docs()`, user input processing, LLM code generation, execution evaluation node.
- **Inside sandbox (Modal Sandbox):** Python code execution with GPU access, persistent state across `exec()` calls within the same sandbox session.

**Interface:**
```python
sb = modal.Sandbox.create(app, image=image, gpu="T4", timeout=600)
exc = sb.exec("python", "-c", code)
stdout = exc.stdout.read()
stderr = exc.stderr.read()
returncode = exc.returncode
```

**Key insight:** Modal preserves state across multiple `exec()` calls within the same sandbox, making it suitable for iterative agent workflows. Lovable uses Modal for "tens of thousands of app creation sessions."

---

## 6. Mastra + E2B Coding Agent

**Repo:** [evilmartians/mastra-coding-agent](https://github.com/evilmartians/mastra-coding-agent)
**Docs:** [mastra.ai/docs/workspace/sandbox](https://mastra.ai/docs/workspace/sandbox)

**Architecture:**
- **Outside sandbox (Mastra agent):** Planning, code generation, file management decisions. Agent defined in `src/mastra/agents/coding-agent.ts`.
- **Inside sandbox (E2B):** Shell command execution (`runCommand`), file operations, dependency management. Tools defined in `src/mastra/tools/e2b.ts`.

**Key insight:** Clean framework-level abstraction where agent definition and tool definitions are separate concerns. E2B tools are standard Mastra tool definitions wrapping sandbox operations.

---

## 7. Perplexity Sandbox API

**Blog:** [perplexity.ai/hub/blog/sandbox-api-isolated-code-execution-for-ai-agents](https://www.perplexity.ai/hub/blog/sandbox-api-isolated-code-execution-for-ai-agents)

Built this pattern internally for their Computer product, Finance Agent, and Deep Research. *"Computer runs thousands of sessions per minute. The Finance Agent uses Sandbox for live market data calculations. Deep Research uses it for file generation, data processing, and format conversion mid-workflow."*

The Sandbox API integrates with their Agent API, *"allowing the orchestration runtime to delegate to deterministic code execution mid-workflow."*

---

## 8. Vercel Call Summary Agent (Assembly Pattern Exemplar)

**Repo:** [vercel-labs/call-summary-agent-with-sandbox](https://github.com/vercel-labs/call-summary-agent-with-sandbox) | 49 stars | Last commit: Dec 2025
**Template:** [vercel.com/templates/next.js/call-summary-agent](https://vercel.com/templates/next.js/call-summary-agent)

This is the closest reference to the pure assembly pattern. An outer workflow gathers data from external sources, assembles it into files, loads them into a sandbox, and then the agent processes the pre-staged data.

**Architecture:**
- **Outside sandbox (Vercel Workflow):** Receives Gong webhook payload, fetches call transcript via Gong API, generates context files (CRM data, competitive intel, playbooks), orchestrates durable workflow with automatic retries via `use step` directive.
- **Inside sandbox (Vercel Sandbox):** Agent explores pre-staged filesystem using bash-tool (`grep -r 'pricing' gong-calls/`, `ls gong-calls/`, `cat gong-calls/metadata.json`). All bash commands are logged for observability. No external API calls from inside the sandbox.

**Interface/payload:** Files staged into sandbox filesystem:
- `gong-calls/` — current call transcript + metadata JSON
- `gong-calls/previous/` — historical call records
- `research/` — company intel, competitive analysis
- `playbooks/` — sales methodology, objection-handling frameworks

**Structured output schema:**
```typescript
{
  summary: string,
  tasks: [{
    taskDescription: string,
    taskOwner: string,
    ownerCompany: 'internal' | 'customer' | 'partner'
  }],
  objections: [{
    description: string,
    quote: string,
    speaker: string,
    speakerCompany: string,
    handled: boolean,
    handledAnswer: string,
    handledScore: number, // 0-100
    handledBy: string
  }]
}
```

**Error handling:** Demo mode auto-enables when Gong credentials are missing. Durable workflow steps have automatic retries and state persistence.

**Key insight:** This is the purest assembly pattern in the wild. External data (Gong API) is gathered by the orchestration layer, assembled into files, and loaded into the sandbox. The sandbox agent only reads files and reasons — it never makes API calls. The outer workflow handles all external integration.

---

## 9. Anthropic Programmatic Tool Calling (Code Execution Tool)

**Docs:** [anthropic.com/engineering/advanced-tool-use](https://www.anthropic.com/engineering/advanced-tool-use)
**API Docs:** [platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool)

Anthropic's own implementation of the assembly pattern at the API level. Instead of sequential tool calls returning to Claude's context, Claude writes a Python orchestration script that runs in a sandboxed code execution environment.

**Architecture:**
- **Outside sandbox (Claude model):** Decides which tools to call and writes Python orchestration code. Only sees final aggregated results, not intermediate data.
- **Inside sandbox (Code Execution tool):** Runs the Python script, calls tools programmatically via `asyncio.gather()`, processes results, filters/aggregates data, returns only the final output.

**Interface/payload:** Claude submits a `server_tool_use` block:
```json
{
  "type": "server_tool_use",
  "name": "code_execution",
  "input": { "code": "...Python orchestration script..." }
}
```

When the script calls a tool, it returns with a `caller` field indicating it originated from code execution:
```json
{
  "type": "tool_use",
  "caller": {
    "type": "code_execution_20250825",
    "tool_id": "srvtoolu_abc"
  }
}
```

**Context management:** Intermediate results (e.g., 2,000+ expense line items) stay inside the sandbox. Only the final aggregated output enters Claude's context window. This achieved 37% token reduction (43,588 to 27,297) and eliminated 19+ inference passes.

**Error handling:** Tools marked with `allowed_callers` must be idempotent and safe to retry. The sandbox handles exceptions in the Python script.

**Key insight:** This is the assembly pattern implemented at the LLM API level. The model writes the assembly logic (Python code), the sandbox executes it with tool access, and only the summary returns. It's a compiler pipeline where Claude is the compiler and the sandbox is the runtime.

---

## 10. Vercel Knowledge Agent Template

**Repo:** [vercel-labs/knowledge-agent-template](https://github.com/vercel-labs/knowledge-agent-template)
**Architecture doc:** [github.com/.../docs/ARCHITECTURE.md](https://github.com/vercel-labs/knowledge-agent-template/blob/main/docs/ARCHITECTURE.md)
**Blog:** [vercel.com/blog/build-knowledge-agents-without-embeddings](https://vercel.com/blog/build-knowledge-agents-without-embeddings)

Replaces vector/RAG pipelines with filesystem + bash in a sandbox. Knowledge sources are synced to a git repo, snapshotted, and agents search with `grep`/`find`/`cat`.

**Architecture:**
- **Outside sandbox (Nuxt app):** Source management in SQLite (GitHub repos, YouTube transcripts, custom APIs), Vercel Workflow syncs sources to a snapshot git repo, chat persistence, question complexity routing (trivial/simple/moderate/complex), model selection.
- **Inside sandbox (Vercel Sandbox from snapshot):** Agent executes read-only bash commands (`grep`, `find`, `cat`, `ls`, `tree`). Blocked commands: `rm`, `curl`, `git`, `ssh`. All results include stdout, stderr, exit codes, command duration.

**Interface:** Sandbox created from snapshot with pre-synced knowledge content. Agent communicates via HTTP POST to `/api/sandbox/shell`. Results are structured responses with stdout/stderr/exitCode.

**Sandbox lifecycle:** Sandboxes are pooled across users. Pre-built snapshots spin up in 1-3s. Snapshots expire after 7 days with automatic recreation. Under 100ms startup when connecting to an already-running sandbox.

**Key insight:** This validates the "filesystem as context" approach — instead of embeddings, you give the agent a filesystem and bash. The assembly happens during the sync step (gathering data from GitHub/YouTube/APIs), and the sandbox is a pure read-only search environment.

---

## 11. Modal Devlooper (Test-Driven Synthesis Agent)

**Repo:** [modal-labs/devlooper](https://github.com/modal-labs/devlooper) | 469 stars | MIT
**Docs:** [modal.com/docs/examples/agent](https://modal.com/docs/examples/agent)

Extends smol developer with test-driven feedback loops. The agent generates code outside the sandbox, runs tests inside, and iterates until all tests pass.

**Architecture:**
- **Outside sandbox (Agent orchestrator):** LLM code generation, error diagnosis as separate Chain-of-Thought step, DebugPlan generation with three action types (inspect/fix file, install package, run commands).
- **Inside sandbox (Modal Sandbox):** Test execution, environment management (package installation), incremental Docker-like image construction with layer caching.

**Interface:**
```python
sb = modal.Sandbox.create(app, image=image)
exc = sb.exec("python", "-c", code)
stdout = exc.stdout.read()
stderr = exc.stderr.read()
returncode = exc.returncode
```

**Error handling:** Non-zero exit codes trigger diagnosis flow. Stdout/stderr from sandbox passed to LLM as separate diagnosis step (not immediate code fix). This separation improves accuracy similar to Chain-of-Thought prompting.

**Key insight:** The agent never runs tests itself — it only generates code and diagnoses errors. The sandbox is a pure test execution environment. Error diagnosis is intentionally separated from code generation for better LLM accuracy.

---

## 12. Restate + Modal Durable Coding Agent

**Blog:** [restate.dev/blog/durable-coding-agent-with-restate-and-modal](https://www.restate.dev/blog/durable-coding-agent-with-restate-and-modal)
**Repo:** [restatedev/ai-examples](https://github.com/restatedev/ai-examples)

Combines Restate (durable execution) + Modal (sandbox) + GPT-5. Treats durability and scalability as infrastructure concerns rather than application logic.

**Architecture:**
- **Outside sandbox (Restate durable workflow):** Planning in persistent steps (plan survives crashes), agent loop with LLM calls wrapped in durable steps (prevents re-execution on recovery), virtual objects maintain chat history and ensure linear operation ordering. Each tool call becomes its own durable step.
- **Inside sandbox (Modal):** Code creation, compilation, command execution. Stateless-client compatible — any process can reconnect and issue commands.

**Data flow:**
```
User Message → Virtual Object (serialize to state)
    → Spawn Durable Workflow → Plan
    → Per-Step Agent Loop → LLM + Tool calls (durable steps)
    → Sandbox → Code execution, compilation
    → Results → Update Virtual Object state → Stream to UI
```

**Error handling:** Transient failures retry automatically. Hard failures resume from last completed step. SAGA-style exception handlers release sandboxes on terminal errors. Cancellation signals propagate through sub-workflows for graceful cleanup.

**Key insight:** The durable execution layer (Restate) ensures that sandbox failures don't re-trigger expensive LLM calls. Each step is independently recoverable. This is the most production-hardened error handling pattern in the set.

---

## 13. LangChain Deep Agents + Sandbox Backends

**Repo:** [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents)
**Docs:** [docs.langchain.com/oss/python/deepagents/sandboxes](https://docs.langchain.com/oss/python/deepagents/sandboxes)
**Blog:** [blog.langchain.com/execute-code-with-sandboxes-for-deepagents](https://blog.langchain.com/execute-code-with-sandboxes-for-deepagents/)

LangChain's production agent harness with pluggable sandbox backends (Modal, Daytona, Runloop, LangSmith).

**Architecture:**
- **Outside sandbox (Deep Agent controller):** Planning, memory management (stored in `/memories/` locally), tool invocation routing, question complexity assessment.
- **Inside sandbox (pluggable backend):** Shell command execution, file operations. All filesystem ops (`read_file`, `write_file`, `edit_file`, `ls`, `glob`, `grep`) are built on top of a single `execute()` method that runs shell commands.

**Interface:** `SandboxBackendProtocol` — providers implement one method:
```python
async def execute(self, command: str, timeout: int = 1800) -> str:
    """Run a shell command, return combined stdout/stderr."""
```

All other file operations auto-translate to shell commands:
- `read_file()` → `cat`
- `write_file()` → redirection operators
- `edit_file()` → `sed`/line operations
- `ls()` / `glob()` / `grep()` → corresponding shell utilities

**Context management:** Large tool results (>80K chars) are evicted to `/large_tool_results/` with preview substitution. Agent memories persist locally while working files are in the remote sandbox (via `CompositeBackend`).

**Error handling:** Non-zero exit codes raise `RuntimeError`. Setup script failures propagate to middleware layer.

**Key insight:** The single `execute()` method is the minimal interface a sandbox needs. Everything else is sugar on top of shell commands. This validates a thin sandbox integration layer.

---

## 14. Anthropic Sandbox Runtime (OS-Level Sandboxing)

**Repo:** [anthropic-experimental/sandbox-runtime](https://github.com/anthropic-experimental/sandbox-runtime) | 3.5k stars | 221 commits
**Blog:** [anthropic.com/engineering/claude-code-sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing)

Not a cloud sandbox — a lightweight OS-level sandboxing tool that enforces filesystem and network restrictions without containers. Used by Claude Code.

**Architecture:**
- **Filesystem isolation:** Write access follows "allow-only" model (all writes blocked unless explicitly permitted). Read access uses "deny-then-allow" (reads permitted by default, with explicit denials overridable via allowlists).
- **Network isolation:** All network access denied by default. Traffic routes through proxy servers (HTTP/HTTPS via HTTP proxy, other TCP through SOCKS5) on the host.
- **Platform implementation:** macOS uses `sandbox-exec` (Apple's Seatbelt framework). Linux uses `bubblewrap` + `seccomp BPF` filters.

**Interface:** Dual usage modes:
1. **CLI:** `srt` command wraps any process with restrictions
2. **Library:** TypeScript exports `SandboxManager`, `SandboxViolationStore`, config types

**Performance:** Reduces permission prompts by 84% in production Claude Code usage.

**Key insight:** Sandboxing doesn't require VMs or containers. OS-level primitives can enforce the same isolation boundaries with near-zero overhead. This approach is complementary to cloud sandboxes — you can use both (OS-level for the outer agent, cloud sandbox for computation).

---

## 15. Fly.io Sprites (Persistent Sandbox VMs)

**Product:** [sprites.dev](https://sprites.dev)
**Blog:** [simonwillison.net/2026/Jan/9/sprites-dev](https://simonwillison.net/2026/Jan/9/sprites-dev/)

Launched January 2026. Persistent Firecracker microVMs designed for AI agent workflows, contrasting with ephemeral sandbox approaches.

**Architecture:**
- Each Sprite is a persistent Linux VM with 100GB NVMe filesystem that survives indefinitely between sessions
- Creation in 1-2 seconds, checkpoint/restore in ~300ms
- Automatic idle (no charges when not running)
- Pricing: $0.07/CPU-hour, $0.04375/GB-hour memory, nothing when idle

**Key difference from E2B/Vercel:** Sprites are designed for persistence. An agent can resume work on a PR without rebuilding the dev environment. This shifts the pattern from "assemble data → execute in ephemeral sandbox → discard" to "assemble data → execute in persistent sandbox → checkpoint → resume later."

**Key insight:** For iterative agent work (multi-session coding tasks), persistent sandboxes with fast checkpoint/restore eliminate the re-assembly cost. For one-shot computation (data analysis, document generation), ephemeral sandboxes remain simpler and cheaper.

---

## 16. E2B AI Analyst (Data Analysis Assembly Pattern)

**Repo:** [e2b-dev/ai-analyst](https://github.com/e2b-dev/ai-analyst) | 362 stars

Data analysis agent demonstrating the CSV → sandbox → chart assembly pattern.

**Architecture:**
- **Outside sandbox (Next.js):** CSV file upload, LLM code generation via Vercel AI SDK (TogetherAI/Fireworks with Llama 3.1), prompt construction.
- **Inside sandbox (E2B Code Interpreter):** Analysis code execution, chart generation via echarts, data processing.

**Data flow:** User uploads CSV → LLM generates Python analysis code → code sent to E2B sandbox → sandbox executes, produces charts → interactive visualizations returned to frontend.

**Key insight:** Clean instance of the assembly pattern applied to data analysis. The outer agent handles file upload and code generation; the sandbox handles computation and visualization. No reasoning inside the sandbox.

---

## Architectural Patterns Taxonomy

Based on the 16 references above, there are three distinct patterns for connecting agents to sandboxes. From [n1n.ai](https://explore.n1n.ai/blog/two-patterns-connecting-ai-agents-sandboxes-2026-02-12) and [Weng Jialin](https://wengjialin.com/blog/agent-sandbox/):

### Pattern A: Sandbox-as-Tool (Integrated)

The sandbox is a tool the agent calls. Agent resides in a control plane and invokes the sandbox when computation is needed. Ephemeral, low overhead, high security.

**Examples:** E2B Code Interpreter, E2B Fragments, E2B AI Analyst, Modal + LangGraph, Anthropic Code Execution Tool

### Pattern B: Agent-in-Sandbox (Decoupled)

The agent runtime lives inside the sandbox. Persistent state, network isolation, complex dependency management. Higher setup cost.

**Examples:** OpenHands, Vercel Coding Agent Template (agent CLI runs inside sandbox), Fly.io Sprites, Claude Code on web

### Pattern C: Assembly + Sandbox (Hybrid)

The outer orchestration layer gathers data from external sources, assembles it into files/context, loads it into the sandbox, and the agent processes the pre-staged data. The sandbox receives pre-gathered inputs only.

**Examples:** Vercel Call Summary Agent, Vercel Knowledge Agent Template, Restate + Modal Durable Agent

**Pattern C is the assembly pattern we're targeting for Sunder.** The outer agent/workflow handles API calls, data gathering, and context assembly. The sandbox is a computation/analysis engine that receives structured inputs.

---

## Cross-Cutting Comparison

| Dimension | Vercel Call Summary | E2B Fragments | OpenHands | Modal Devlooper | Anthropic Code Exec | LangChain Deep Agents |
|---|---|---|---|---|---|---|
| **Stars** | 49 | 6.2k | 69.6k | 469 | N/A (API) | New (2026) |
| **Outside sandbox** | Gong API, file assembly, durable workflow | LLM streaming, FragmentSchema gen | LLM reasoning, planning, state mgmt | LLM code gen, error diagnosis | Claude writes Python script | Planning, memory, tool routing |
| **Inside sandbox** | Bash file exploration only | Dependency install, code exec | Bash, file ops, Jupyter, browser | Test execution, env management | Python script + tool calls | Shell execution via `execute()` |
| **Interface format** | Files staged in filesystem | `FragmentSchema` JSON | Action/Observation HTTP events | `sb.exec()` → stdout/stderr | `server_tool_use` JSON block | `execute(command) → string` |
| **Error handling** | Durable step retries | stdout/stderr/cellResults | Observation errors in event stream | Separate diagnosis step via CoT | Idempotent tools, retry-safe | `RuntimeError` on non-zero exit |
| **Sandbox lifecycle** | Ephemeral per workflow | Ephemeral per fragment | Docker container per session | Persistent w/ layer caching | Ephemeral per API call | Configurable per backend |
| **Assembly pattern?** | Yes (pure) | Partial (LLM generates payload) | No (agent does everything) | Yes (generate → test cycle) | Yes (at API level) | Partial (composite backend) |

---

## Sandbox Infrastructure Comparison

| Platform | Isolation | Startup | Persistence | Pricing Model | Best For |
|---|---|---|---|---|---|
| **Vercel Sandbox** | Firecracker microVM | <2s (snapshot: <100ms) | Ephemeral (snapshots for state) | Active CPU time only | Web apps, Next.js agents |
| **E2B** | Firecracker microVM | <200ms | Ephemeral (state per session) | Per-second billing | Code interpretation, data analysis |
| **Modal** | Container + GPU | ~2s | Persistent across exec() | Per-second compute | ML workloads, GPU tasks |
| **Fly.io Sprites** | Firecracker microVM | 1-2s (restore: ~300ms) | 100GB persistent NVMe | $0.07/CPU-hour, $0 idle | Long-running coding agents |
| **Anthropic SRT** | OS-level (bubblewrap/seatbelt) | Near-zero | N/A (same process) | Free (open source) | Local agent sandboxing |
| **Daytona** | Container | 90ms | Persistent workspace | Usage-based | Computer use, browser automation |

---

## Security Best Practices

From [NVIDIA](https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/), [Firecrawl](https://www.firecrawl.dev/blog/ai-agent-sandbox), [Bunnyshell](https://www.bunnyshell.com/guides/sandboxed-environments-ai-coding/), [Vercel Sandbox docs](https://vercel.com/docs/vercel-sandbox/sdk-reference):

- Use full virtualization (VMs, Firecracker microVMs) over shared-kernel containers when possible
- Treat all tool results as untrusted input — tool output is a prompt injection surface
- Ephemeral sandboxes prevent accumulated state and credential leakage
- Non-root containers, network egress filtering, read-only mounts, strict timeouts
- **Credential brokering** (Vercel Sandbox): Inject secrets into outbound requests without exposing them inside the sandbox, preventing data exfiltration even when running untrusted code. Use `updateNetworkPolicy()` to switch from `allow-all` to `deny-all` after gathering data.
- Real-world failures: Claude Code wiped a user's home directory via `rm -rf`; Replit's agent deleted a production PostgreSQL database; Claude Code agents escaped sandbox via `/proc/self/root` bypass

---

## Vercel Sandbox SDK Reference (Key APIs)

Since Sunder is on Vercel, the `@vercel/sandbox` SDK is the most relevant. Key APIs for the assembly pattern:

```typescript
// 1. Create sandbox (optionally from snapshot for fast startup)
const sandbox = await Sandbox.create({
  runtime: 'node24',
  source: { type: 'snapshot', snapshotId },
  networkPolicy: 'deny-all',  // No egress during computation
  env: { NODE_ENV: 'production' },
  timeout: 300_000,  // 5 minutes
});

// 2. Write pre-gathered data as files
await sandbox.writeFiles([
  { path: 'data/input.json', content: Buffer.from(JSON.stringify(payload)) },
  { path: 'scripts/analyze.py', content: Buffer.from(analysisScript) },
]);

// 3. Run computation
const result = await sandbox.runCommand('python', ['scripts/analyze.py']);
const output = await result.stdout();
const errors = await result.stderr();

// 4. Read results
const resultBuffer = await sandbox.readFileToBuffer({ path: 'output/result.json' });

// 5. Cleanup
await sandbox.stop();
```

Key capabilities:
- **Snapshots:** Capture sandbox state for fast restarts (skip setup). Expire after 30 days by default.
- **Network policies:** Switch between `allow-all`, `deny-all`, or domain-specific allow lists. Supports credential brokering (inject API keys into outbound requests without exposing them in the sandbox).
- **File I/O:** `writeFiles()`, `readFile()`, `readFileToBuffer()`, `downloadFile()`, `mkDir()`.
- **Streaming:** `command.logs()` for real-time stdout/stderr streaming.
- **Resources:** 1-8 vCPUs, 2GB RAM per vCPU, up to 4 exposed ports.
- **Timeouts:** Default 5 min, extendable to 45 min (Hobby) or 5 hours (Pro/Enterprise).

---

## Implications for Sunder

The assembly pattern is well-validated across production systems. The key takeaways:

1. **Vercel Call Summary Agent is the closest analog** to Sunder's planned approach — external data gathering (webhooks, APIs) → file assembly → sandbox processing → structured output. Same vendor, same stack, production-proven.
2. **E2B Fragments validates the typed schema approach** — `FragmentSchema` constrains the LLM and makes sandbox execution deterministic. Sunder's sandbox tools should use similar typed Zod schemas.
3. **Anthropic's programmatic tool calling validates the "sandbox as computation engine" approach** at the API level — 37% token reduction by keeping intermediate data out of context.
4. **The interface should be a typed schema**, not free-form strings. This constrains the LLM and makes sandbox execution deterministic.
5. **Sandbox lifecycle matters** — ephemeral (E2B Fragments) is simplest for one-shot tools; persistent (Modal, Sprites) is better if iterative analysis is needed. Sunder's `sandbox_sessions` table supports the persistent model.
6. **Error propagation pattern is consistent** — stdout/stderr + structured results back to the outer agent, which decides whether to retry or surface the error.
7. **Vercel Sandbox snapshots** enable the "pre-warm" pattern — snapshot a sandbox with common dependencies installed, then create new sandboxes from the snapshot for near-instant startup (<100ms).
8. **Network policy switching** is a powerful security pattern — start with `allow-all` during setup, switch to `deny-all` before running untrusted computation. Vercel Sandbox supports this natively via `updateNetworkPolicy()`.
9. **Credential brokering** (Vercel Sandbox) eliminates the need to pass API keys into the sandbox. Secrets are injected into outbound requests by the proxy layer.
10. **The `execute()` single-method interface** (LangChain Deep Agents) is the minimal viable sandbox integration. All filesystem operations can be built on top of shell commands.

---

## Sources

### Primary References (Repos & Docs)
- [Vercel Coding Agent Template](https://github.com/vercel-labs/coding-agent-template) — 1.6k stars
- [Vercel Call Summary Agent](https://github.com/vercel-labs/call-summary-agent-with-sandbox) — 49 stars
- [Vercel Knowledge Agent Template](https://github.com/vercel-labs/knowledge-agent-template)
- [Vercel Sandbox SDK Reference](https://vercel.com/docs/vercel-sandbox/sdk-reference)
- [E2B Fragments](https://github.com/e2b-dev/fragments) — 6.2k stars
- [E2B Code Interpreter](https://github.com/e2b-dev/code-interpreter) — 2.3k stars
- [E2B AI Analyst](https://github.com/e2b-dev/ai-analyst) — 362 stars
- [OpenHands](https://github.com/OpenHands/OpenHands) — 69.6k stars | [Runtime Docs](https://docs.openhands.dev/openhands/usage/architecture/runtime) | [SDK Paper](https://arxiv.org/pdf/2511.03690)
- [Modal Coding Agent Example](https://modal.com/docs/examples/agent) | [Devlooper](https://github.com/modal-labs/devlooper) — 469 stars
- [Mastra Coding Agent](https://github.com/evilmartians/mastra-coding-agent) | [Sandbox Docs](https://mastra.ai/docs/workspace/sandbox)
- [LangChain Deep Agents](https://github.com/langchain-ai/deepagents) | [Sandbox Docs](https://docs.langchain.com/oss/python/deepagents/sandboxes)
- [Anthropic Sandbox Runtime](https://github.com/anthropic-experimental/sandbox-runtime) — 3.5k stars
- [Restate + Modal Durable Agent](https://www.restate.dev/blog/durable-coding-agent-with-restate-and-modal) | [AI Examples](https://github.com/restatedev/ai-examples)

### Architecture Articles
- [Anthropic: Advanced Tool Use (Programmatic Tool Calling)](https://www.anthropic.com/engineering/advanced-tool-use)
- [Anthropic: Claude Code Sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing)
- [Vercel: How to build agents with filesystems and bash](https://vercel.com/blog/how-to-build-agents-with-filesystems-and-bash)
- [Vercel: Build knowledge agents without embeddings](https://vercel.com/blog/build-knowledge-agents-without-embeddings)
- [n1n.ai: Two Patterns for Connecting AI Agents to Sandboxes](https://explore.n1n.ai/blog/two-patterns-connecting-ai-agents-sandboxes-2026-02-12)
- [Weng Jialin: AI Agent Sandbox Architecture Patterns](https://wengjialin.com/blog/agent-sandbox/)
- [LangChain: Execute Code with Sandboxes for Deep Agents](https://blog.langchain.com/execute-code-with-sandboxes-for-deepagents/)
- [Perplexity Sandbox API](https://www.perplexity.ai/hub/blog/sandbox-api-isolated-code-execution-for-ai-agents)

### Security & Comparison
- [NVIDIA: Sandboxing Agentic AI Workflows with WebAssembly](https://developer.nvidia.com/blog/sandboxing-agentic-ai-workflows-with-webassembly/)
- [NVIDIA: Practical Security Guidance for Sandboxing](https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/)
- [Firecrawl: AI Agent Sandbox Guide](https://www.firecrawl.dev/blog/ai-agent-sandbox)
- [Fly.io Sprites](https://sprites.dev/) | [Simon Willison analysis](https://simonwillison.net/2026/Jan/9/sprites-dev/)
- [Better Stack: 11 Best Sandbox Runners in 2026](https://betterstack.com/community/comparisons/best-sandbox-runners/)
- [awesome-sandbox (curated list)](https://github.com/restyler/awesome-sandbox)
