# Assembly Pattern Playbook: Proven Repos for Safe, Sandboxed AI Execution

## Executive Summary

The transition from monolithic AI agents to the "assembly pattern" marks a critical maturation in AI orchestration. This pattern enforces a strict architectural boundary: an outer AI agent performs planning and data gathering (e.g., web scraping, API calls) and assembles a structured payload, which is then handed off to an isolated sandboxed execution environment for heavy computation or rendering [executive_summary[0]][1] [executive_summary[1]][2]. The sandbox does not conduct initial data gathering itself; it acts purely as an execution engine [executive_summary[0]][1].

**Key Strategic Insights:**
* **Sandbox-as-a-Tool wins:** Top implementations like E2B, AutoGen with YepCode, and Modal cleanly separate orchestration from execution [executive_summary[2]][3] [executive_summary[3]][4]. Prioritize these for "pure" assembly builds.
* **Stateful execution slashes iteration time:** Platforms like E2B support pause, resume, and snapshots, allowing agents to maintain state across calls and avoid repeated setup costs [key_architectural_patterns_observed[1]][5].
* **Security posture hinges on boundary discipline:** Projects mixing browsing and compute in one runtime (like Auto-GPT) violate this pattern [notable_exclusions[0]][1]. Keep all research outside the sandbox and adopt brokered secrets [key_architectural_patterns_observed[1]][5].
* **Latency and scale are practical:** Vercel sandboxes start in milliseconds, and E2B bills per active second, making production SLAs feasible [cost_and_performance_comparison.startup_time[0]][1] [cost_and_performance_comparison.provider_name[1]][5].
* **Structured handoffs cut token burn:** Enforcing JSON outputs and returning structured execution objects (like E2B's base64 artifacts) prevents context window pollution [key_architectural_patterns_observed[1]][5].
* **Error models vary—retries must be selective:** Distinguish between transient infrastructure errors (retry with backoff) and user-code errors (feed back to LLM for repair) [error_handling_and_context_management_strategies[0]][6].
* **Manage LLM context via summaries:** Avoid dumping raw stdout/stderr into prompts. Persist outputs to object storage and pass only structured summaries or artifact references [error_handling_and_context_management_strategies[0]][6].

## Why the Assembly Pattern Now

Strictly separating planning and gathering (outside) from compute and rendering (inside) reduces risk, cost, and flakiness while enabling scale and auditability. There are two dominant architectural patterns observed: the "Sandbox-as-a-Tool" (Agent Outside) and the "Agent-in-Sandbox" (Hybrid Model) [key_architectural_patterns_observed[4]][7]. The assembly pattern relies on the former, treating the sandbox as a specialized, stateless, or stateful tool invoked on-demand via an SDK or API [key_architectural_patterns_observed[0]][2].

### Business Drivers: Breach Risk, Token Spend, and Developer Velocity
Running untrusted, LLM-generated code in the same environment where an agent holds API keys or performs web scraping is a massive security vulnerability. By isolating the execution environment, businesses mitigate exfiltration risks [key_architectural_patterns_observed[1]][5]. Furthermore, separating the environments allows developers to scale the orchestration layer independently from the heavy compute layer, optimizing token spend by only returning structured results rather than verbose execution logs [key_architectural_patterns_observed[1]][5].

### Technical Enablers: MicroVMs, Warm Pools, Durable Orchestration
The rise of fast-booting microVMs (like Firecracker) and container warm pools has made the assembly pattern technically viable [key_architectural_patterns_observed[1]][5]. Orchestration frameworks like LangGraph now provide durable execution, ensuring that if a workflow is interrupted, it can be resumed from its last recorded state without reprocessing previous steps [key_architectural_patterns_observed[2]][8] [error_handling_and_context_management_strategies[0]][6].

## Ranked Reference Implementations

Choose "sandbox-as-a-tool" SDKs first (E2B, Modal, YepCode+AutoGen) for pure assembly builds. Use Vercel's template when repo-driven coding UX is paramount.

### Comparative Matrix: Adherence, Isolation, and Handoff

| Project | Pattern Adherence | Isolation | Statefulness | Handoff Interface | Error Model |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **E2B code-interpreter** | Pure (outer agent + microVM exec) | Firecracker microVM | Pause/resume/snapshot | SDK: `runCode`, `files.write` | Structured Execution + snapshots |
| **AutoGen + YepCode** | Pure (AutoGen plans, YepCode executes) | YepCode serverless sandbox | Stateless per job (warmable) | `execute_code_blocks([...])` | `exit_code` + `output` |
| **Modal sandboxes** | Pure (outer client + container exec) | Container | Warm pools, memory snapshot | `sandbox.exec(cmd)` | exit code + stdout/stderr |
| **Vercel coding-agent** | Hybrid (outer orchestration; agent CLI inside) | Firecracker microVM | KeepAlive, snapshots | `Sandbox.create` + `runCommand` | `exitCode` + stdout/stderr |
| **Fly.io Sprites** | Pure (outer controller + microVM exec) | MicroVM | Persistent disk checkpoints | REST `/exec` + file APIs | exit code + logs |
| **Composio (exec-sandbox)** | Pure (toolkit → remote exec) | QEMU microVM (proposed) | Persistent Jupyter-like sessions | `session.exec`, read/write | Structured results |

*Takeaway: E2B and AutoGen+YepCode offer the most direct, pure implementations of the assembly pattern, providing explicit SDKs for an outer agent to control an isolated sandbox [ranking_of_implementations[0]][2] [ranking_of_implementations[3]][9].*

### Relevance Rationale by Rank
E2B (`e2b-dev/code-interpreter`) ranks highest because it is an SDK designed specifically for this pattern, providing a clean API for an external agent to create, manage, and execute code within a secure microVM [ranking_of_implementations[0]][2]. AutoGen + YepCode is a close second, perfectly demonstrating a popular agent framework delegating code execution to a remote, secure sandbox [ranking_of_implementations[3]][9]. Modal provides robust primitives for containerized execution [ranking_of_implementations[10]][10], while Vercel offers a powerful hybrid approach tailored for coding agents [ranking_of_implementations[0]][2].

## Architecture Deep Dives

Each top repository cleanly demonstrates the flow: gather/assemble outside → compute/render inside → structured results back.

### E2B (code-interpreter & ai-artifacts)
The architecture follows a clear assembly pattern where an outer agent gathers data and prepares a payload, then uses the E2B SDK to programmatically create a secure Firecracker microVM sandbox [reference_implementations.0.architecture_flow[0]][11]. The outer agent handles all high-level orchestration, including web scraping and LLM interaction [reference_implementations.0.outside_sandbox_responsibilities[0]][11]. The sandbox executes the AI-generated code, installs packages, and renders artifacts [reference_implementations.0.inside_sandbox_responsibilities[0]][11]. The handoff is managed via programmatic function calls like `sbx.runCode('...')`, returning a structured `Execution` object [reference_implementations.0.handoff_interface_payload[0]][11].

### AutoGen + YepCode
This integration perfectly implements the assembly pattern. The AutoGen agent acts as the outer planner, gathering data and generating code blocks [reference_implementations.1.architecture_flow[0]][9]. It uses the `YepCodeCodeExecutor` to hand off these blocks to a YepCode sandbox, which installs dependencies and executes the code [reference_implementations.1.architecture_flow[0]][9]. The handoff occurs through the `execute_code_blocks` method, returning a `YepCodeCodeResult` containing the exit code and output [reference_implementations.1.handoff_interface_payload[0]][9]. Errors are propagated via this result object, leaving retry logic to the outer AutoGen agent [reference_implementations.1.error_propagation_and_recovery[0]][9].

### Modal Sandboxes
An outer agent uses the Modal SDK to define a container image and create a sandbox [ranking_of_implementations[10]][10]. Commands are executed inside the sandbox via `sandbox.exec(...)` [ranking_of_implementations[10]][10]. The orchestrator waits for completion, reads the streams, and terminates the sandbox, clearly separating orchestration from execution [ranking_of_implementations[10]][10].

### Vercel Coding Agent Template
This architecture separates an outer Next.js server orchestrator from the Vercel Sandbox execution environment [comparative_analysis_of_sandbox_providers.key_features[0]][12]. The server validates requests and assembles a `SandboxConfig` payload [comparative_analysis_of_sandbox_providers.handoff_mechanism[0]][13]. Inside the sandbox, repositories are cloned and agent CLIs are executed [comparative_analysis_of_sandbox_providers.key_features[0]][12].

## Orchestration Layer Patterns

Model orchestration as a graph; call sandboxes as tools; centralize state and error routing.

### LangGraph Baseline
LangGraph is used to build the "outer agent" part of the assembly pattern, allowing developers to define stateful workflows as a graph. When computation is needed, the graph routes to an execution node that wraps a sandboxed executor (like E2B or Modal). LangGraph's built-in persistence layer provides durable execution, ensuring state is saved to a durable store so workflows can resume after interruptions [error_handling_and_context_management_strategies[0]][6].

## Security & Isolation Guardrails

Keep raw secrets out of the sandbox; prefer microVM isolation and domain allowlists.

### Isolation Tech Comparison

| Provider | Isolation Technology | Secrets Strategy | Network Controls |
| :--- | :--- | :--- | :--- |
| **Vercel Sandbox** | Firecracker microVM [security_and_isolation_model_comparison.provider_name[0]][1] | Credential brokering via external proxy [security_and_isolation_model_comparison.secrets_management_strategy[1]][13] | Dynamic runtime firewall; deny > allow [security_and_isolation_model_comparison.network_policy_features[0]][13] |
| **E2B** | Firecracker microVM [key_architectural_patterns_observed[1]][5] | Environment variables [key_architectural_patterns_observed[1]][5] | Domain allow/deny lists [key_architectural_patterns_observed[1]][5] |
| **Composio** | QEMU microVM (proposed) [ranking_of_implementations[6]][14] | Toolkit-managed | TBD |

*Takeaway: Vercel Sandbox adds application-layer controls on top of VM isolation, using credential brokering to keep secrets outside the sandbox entirely [key_architectural_patterns_observed[1]][5].*

## Cost & Performance Levers

Use warm pools and snapshots where latency matters; align billing to workload shape.

### Provider Economics & SLAs

| Provider | Startup Time | Billing Model | Concurrency |
| :--- | :--- | :--- | :--- |
| **Vercel Sandbox** | Milliseconds [cost_and_performance_comparison.startup_time[0]][1] | Active CPU ($0.128/vCPU-hr) [cost_and_performance_comparison.provider_name[1]][5] | Up to 2,000 executions |
| **E2B** | Fast microVM | Per-second wall-clock ($0.0504/vCPU-hr) [cost_and_performance_comparison.provider_name[1]][5] | Parallel via SDK |
| **YepCode** | Serverless cold starts | Per execution | Account concurrency caps |

*Takeaway: Vercel's Active CPU billing is cost-effective for I/O-bound workloads, while E2B charges for full wall-clock time regardless of CPU activity [cost_and_performance_comparison.provider_name[1]][5].*

## Error Handling & Context Management Playbook

Classify errors; retry infra only; return structured summaries and artifact refs to the LLM.

### Error Taxonomy & Actions
A nuanced retry strategy is required. For transient infrastructure errors, the agent should retry with exponential backoff. For user-code errors, the agent should not blindly retry; instead, it should analyze the logs and attempt to repair the code [error_handling_and_context_management_strategies[0]][6]. E2B's stateful recovery allows an agent to pause a sandbox upon failure, debug, and resume, or roll back to a snapshot [error_handling_and_context_management_strategies[0]][6].

### Context Strategy: Summaries over Logs
Passing full, verbose logs directly into an LLM's context window is an anti-pattern [error_handling_and_context_management_strategies[0]][6]. The sandbox should produce structured outputs and save large results as artifacts. E2B excels by returning structured objects, such as base64-encoded PNG images for charts, keeping raw data out of the prompt [key_architectural_patterns_observed[1]][5].

## Data Analysis Pattern

Upload clean CSV/JSON; execute a concise script; retrieve structured results and images.

### Implementations and Artifact Handling
The outer agent scrapes data, cleans it, and uploads it to the sandbox's isolated filesystem [identified_data_analysis_patterns.0.workflow_steps[0]][7]. The agent then sends a Python script to execute within the sandbox (e.g., using pandas) [identified_data_analysis_patterns.0.workflow_steps[0]][7]. Finally, the agent retrieves the results, such as a structured JSON output or a base64-encoded visualization [identified_data_analysis_patterns.0.workflow_steps[0]][7]. This pattern is effectively implemented using E2B, Composio, or LangGraph [identified_data_analysis_patterns.0.example_implementations[0]][7].

## Browser Automation Pattern

Plan externally; run Playwright/Puppeteer scripts in a locked-down sandbox.

### Implementations and Guardrails
The outer agent determines the target URL and actions, then hands off a Playwright script to the sandbox. The sandbox executes the script under strict network policies to prevent unintended access. The script gathers data, performs light post-processing, and returns a sanitized payload to the outer agent.

## Canonical Assembly Contract

Use a JSON schema to standardize handoffs, reduce flakiness, and improve auditability.

### Schema and Retry Pseudocode
The handoff payload should be concise and use references (e.g., S3 URIs) for large artifacts rather than embedding blobs [proposed_canonical_assembly_contract.schema_description[0]][15].

```json
{
 "task_id": "8f2d6a0f-...",
 "run_id": "8f2d6a0f-...-1",
 "entrypoint": { "type": "python", "path": "run.py" },
 "input_refs": [ { "type": "s3", "uri": "s3://my-bucket/data.json" } ],
 "network_policy": { "mode": "custom", "allow": ["api.example.com"] },
 "retry_policy": { "max_attempts": 3, "retry_on": ["transient_error"] }
}
```
*Note: The outer agent uses this contract to instruct the sandbox, ensuring a complete, unambiguous set of instructions [proposed_canonical_assembly_contract.schema_description[0]][15].*

## Anti-Patterns & Failure Cases

Don't do research inside the sandbox; don't pass raw secrets.

### Case Notes: Auto-GPT and OpenHands
Performing data gathering inside the sandbox is a critical anti-pattern. Projects like Auto-GPT integrate commands like `browse_website` directly into the main agent loop, mixing data collection with code execution [notable_exclusions[0]][1]. Similarly, OpenHands integrates browser automation directly into its backend agent runtime, violating the strict assembly pattern [notable_exclusions[0]][1]. Furthermore, isolating the tool (running code in a sandbox while keeping the agent on the backend) is preferred over putting the entire agent in a sandbox with secrets [common_pitfalls_and_anti_patterns[2]][16].

## Decision Guide by Use Case

Pick the backend per task shape; apply targeted guardrails and SLAs.

### Use-Case Mapping

| Use Case | Recommended Stack | Key Guardrails |
| :--- | :--- | :--- |
| **Coding Agents** | Vercel Sandbox, E2B, Modal [recommendations_by_use_case.recommended_technologies[0]][17] | Run orchestrator outside; manage Git credentials externally; use ephemeral sandboxes for automated runs [recommendations_by_use_case.architectural_pattern_guidance[0]][17]. |
| **Data Science** | E2B or Modal + LangGraph | Use artifact stores; summarize outputs; leverage stateful sessions. |
| **Browser Automation** | E2B/Modal + Playwright | Enforce domain allowlists; return sanitized outputs. |

*Takeaway: For coding agents, the sandbox should be used exclusively for the 'inner loop' of editing and testing, while the outer agent handles final Git operations to prevent credential exposure [recommendations_by_use_case.architectural_pattern_guidance[0]][17].*

## Implementation Roadmap

Ship a thin slice with the canonical contract, error taxonomy, and artifact pipeline.

### Week 1: POC and Outer Loop
Select E2B or Modal as the primary runtime. Stand up a LangGraph outer loop to handle orchestration and define the JSON handoff contract.

### Week 2: Security and Artifacts
Implement credential brokering to keep raw secrets out of the sandbox. Configure dynamic network firewalls (deny-by-default). Set up an S3/GCS artifact store to keep large blobs out of the LLM context.

### Week 3: Error Taxonomy and Retries
Implement the error taxonomy: build exponential backoff for transient infrastructure errors and an LLM "repair loop" for user-code errors.

### Week 4: Load Testing and SLOs
Run concurrent load tests (e.g., 200-500 concurrent executions). Measure cold start latency, cost per successful run, and validate runbooks for go/no-go decisions.

## Metrics & Governance

Track cost per successful run, retry mix, and secret exposure incidents.

### KPI Table

| KPI | Target | Why it matters |
| :--- | :--- | :--- |
| **Cost per successful task** | Down 30% vs. baseline | Token and compute hygiene |
| **First-result latency** | p50 < 2s; p95 < 5s | UX and SLA |
| **Retry composition** | <10% infra; 0 blind code retries | Reliability discipline |
| **Artifact/summarization ratio** | >80% artifact refs | Context cost control |
| **Secret exposure incidents** | 0 | Security baseline |

*Takeaway: Monitoring the artifact-to-summarization ratio ensures that the LLM context window remains unpolluted, directly controlling token spend.*

## Appendix

Favor actively maintained SDKs with clear error models and state controls.

### Repos & Signals

| Repo | URL | Stars/Signals | Maintenance Notes |
| :--- | :--- | :--- | :--- |
| **E2B code-interpreter** | `github.com/e2b-dev/code-interpreter` [reference_implementations.0.repository_url[0]][11] | ~2.3k [reference_implementations.0.maintenance_status[0]][11] | Core, active; stateful sessions |
| **AutoGen + YepCode** | `github.com/yepcode/autogen-ext-yepcode` [reference_implementations.1.repository_url[0]][9] | 2 stars | Early extension; promising |
| **Modal examples** | `github.com/modal-labs/modal-examples` | ~1.1k | Active SDK; many patterns |
| **Vercel coding-agent** | `github.com/vercel-labs/coding-agent-template` | ~1.6k | Production template; hybrid |
| **LangGraph** | `github.com/langchain-ai/langgraph` | ~27k | Orchestration backbone |

## References

1. *Vercel Sandbox*. https://vercel.com/docs/vercel-sandbox
2. *E2B Documentation*. https://e2b.dev/docs
3. *code-interpreter/README.md at main · e2b-dev/code-interpreter · GitHub*. https://github.com/e2b-dev/code-interpreter/blob/main/README.md
4. *YepCode - The Developer-First Platform for AI-Powered Integrations*. https://yepcode.io/
5. *Vercel Sandbox vs E2B | Vercel Knowledge Base*. https://vercel.com/kb/guide/vercel-sandbox-vs-e2b
6. *Fetched web page*. https://docs.langchain.com/oss/python/langgraph/durable-execution
7. *The two patterns by which agents connect sandboxes*. https://blog.langchain.com/the-two-patterns-by-which-agents-connect-sandboxes/
8. *Fetched web page*. https://docs.langchain.com/oss/python/langgraph/overview
9. *GitHub - yepcode/autogen-ext-yepcode: Enables Autogen agents to securely execute code in isolated remote sandboxes using YepCode's serverless runtime. · GitHub*. https://github.com/yepcode/autogen-ext-yepcode
10. *Build a coding agent with Modal Sandboxes and LangGraph | Modal Docs*. https://modal.com/docs/examples/agent
11. *GitHub - e2b-dev/code-interpreter: Python & JS/TS SDK for running AI-generated code/code interpreting in your AI app · GitHub*. https://github.com/e2b-dev/code-interpreter
12. *coding-agent-template/lib/sandbox at main · vercel-labs/coding-agent-template · GitHub*. https://github.com/vercel-labs/coding-agent-template/tree/main/lib/sandbox
13. *Sandbox SDK Reference*. https://vercel.com/docs/vercel-sandbox/sdk-reference
14. *Feature: exec-sandbox as a hardware-isolated sandbox backend (QEMU microVMs) · Issue #2823 · ComposioHQ/composio · GitHub*. https://github.com/ComposioHQ/composio/issues/2823
15. *Handoffs — AutoGen*. https://microsoft.github.io/autogen/stable//user-guide/core-user-guide/design-patterns/handoffs.html
16. *How We Built Secure, Scalable Agent Sandbox Infrastructure*. https://browser-use.com/posts/two-ways-to-sandbox-agents
17. *GitHub - vercel-labs/coding-agent-template: Multi-agent AI coding platform powered by Vercel Sandbox and AI Gateway · GitHub*. https://github.com/vercel-labs/coding-agent-template
