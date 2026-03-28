# Cloudflare Dynamic Workers

_Released 2026-03-24 (open beta). V8 isolate-based sandboxing for AI agent code execution — 100x faster than containers._

> "Want to handle a million requests per second, where every single request loads a separate Dynamic Worker sandbox, all running concurrently? No problem."

---

## What It Is

Dynamic Workers are a new Cloudflare primitive that lets a parent Worker **instantiate child Workers at runtime** with code specified on the fly. Instead of pre-deploying a Worker per tenant or per task, you call `env.LOADER.load()` with raw source code and get back an isolated V8 sandbox in milliseconds.

The core unlock: **AI agents generate TypeScript → Dynamic Worker executes it in isolation → results return to the agent.** No container boot, no deployment pipeline, no warm pool management.

---

## Why It Matters

### The Problem It Solves

Traditional AI agent architectures use sequential **tool calls** — the LLM calls one tool at a time, gets a result, reasons, calls the next tool. This is slow and token-expensive. The alternative is "code mode" — the LLM writes a single TypeScript function that chains multiple API calls together, but you need somewhere safe to execute untrusted code.

Existing sandbox options (E2B, Vercel Sandbox, Modal) use containers or microVMs with cold starts in the 90-200ms range. Dynamic Workers use V8 isolates with **millisecond cold starts** and **megabytes of memory** (vs hundreds of MB for containers).

### Key Claim: 81% Token Reduction

By switching from sequential tool calls to code generation ("code mode"), Cloudflare claims **81% reduction in inference tokens and cost**. The agent writes one function that programmatically processes data instead of sending it all through the LLM token by token.

### The "Extendable Platform" Angle

This is what the tweet in the screenshot is excited about. Dynamic Workers let SaaS builders create **platforms where end-users (or their AI agents) deploy custom code** that runs in isolated sandboxes:

1. SaaS defines TypeScript interfaces for allowed operations
2. LLM generates code against those interfaces
3. Code runs in isolated Dynamic Worker with only scoped RPC bindings
4. Each user/tenant gets complete isolation with zero shared state

**Zite** (referenced in Cloudflare's blog) is building exactly this — a chat interface where the LLM writes TypeScript to build CRUD apps connecting to Stripe, Airtable, Google Calendar, etc. Each automation runs in its own Dynamic Worker.

---

## Architecture

### V8 Isolates (Not Containers)

| Property | V8 Isolate (Dynamic Workers) | Container (E2B, Vercel Sandbox) |
|----------|-----------------------------|---------------------------------|
| Cold start | Milliseconds | 90-200ms |
| Memory | Megabytes | Hundreds of MB |
| Isolation | V8 engine boundary + custom layers | Firecracker microVM / gVisor |
| Concurrency | Unlimited (per Cloudflare) | Pool-limited |
| Languages | JS primary, Python/WASM supported | Any |
| Session duration | Up to 30 min | Up to 24h (E2B) |
| GPU | No | No (E2B/Vercel); Yes (Modal) |

Each isolate is an instance of the V8 JavaScript engine (same as Chrome). They run on the same thread/machine as the parent Worker when possible.

### Five-Layer Security Model

1. **V8 Isolate Sandboxing** — language-level isolation, each isolate fully separate
2. **Custom Second Sandbox** — dynamic cordoning of tenants based on risk assessment
3. **Hardware Security** — Memory Protection Keys (MPK) for Spectre mitigations
4. **Patch Management** — security patches deployed within hours (faster than Chrome itself)
5. **Code Scanning** — automated detection of malicious patterns with additional sandboxing

Cloudflare acknowledges isolates have a **"more complicated attack surface than hardware VMs"** with more frequent V8 security bugs than hypervisors, hence the multi-layer defense.

### Network Control

```javascript
// Complete internet isolation
globalOutbound: null

// Route/inspect/enrich all fetch() calls through your own handler
globalOutbound: myFetcherBinding
```

Credentials can be injected into outbound requests transparently — the agent code never sees secrets directly.

### API Binding via RPC (Not HTTP)

Dynamic Workers use **Cap'n Web RPC** for cross-sandbox method invocation. You define TypeScript interfaces and pass RPC stubs as bindings:

```typescript
// Parent defines the API surface
interface ChatRoom {
  getHistory(limit: number): Promise<Message[]>;
  subscribe(callback: (msg: Message) => void): Promise<Disposable>;
  post(text: string): Promise<void>;
}

// Agent code calls it like a local library
let history = await env.CHAT_ROOM.getHistory(1000);
return history.filter(msg => msg.author == "alice");
```

This is more secure than HTTP proxying because you expose **exact methods** rather than trying to interpret and authorize arbitrary HTTP requests.

---

## API Reference

### Worker Loader Binding

**wrangler.jsonc:**
```json
{
  "worker_loaders": [
    { "binding": "LOADER" }
  ]
}
```

**wrangler.toml:**
```toml
[[worker_loaders]]
binding = "LOADER"
```

### load() — One-Time Execution

```javascript
const worker = env.LOADER.load({
  compatibilityDate: "2026-03-01",
  mainModule: "src/index.js",
  modules: {
    "src/index.js": `
      export default {
        fetch(request) {
          return new Response("Hello from a dynamic Worker");
        }
      };
    `
  },
  env: { CHAT_ROOM: chatRoomRpcStub },  // RPC bindings
  globalOutbound: null                    // network control
});

let entrypoint = worker.getEntrypoint();
return entrypoint.fetch(request);
```

### get() — Cached/Reusable Workers

```javascript
const worker = env.LOADER.get("hello-v1", async () => {
  let code = await env.MY_CODE_STORAGE.get("hello-v1");
  return {
    compatibilityDate: "2026-03-01",
    mainModule: "index.js",
    modules: { "index.js": code },
    globalOutbound: null
  };
});
// Callback only executes if worker isn't already cached
```

### @cloudflare/worker-bundler — TypeScript + npm Dependencies

```typescript
import { createWorker } from "@cloudflare/worker-bundler";

const worker = env.LOADER.get("my-worker", async () => {
  const { mainModule, modules } = await createWorker({
    files: {
      "src/index.ts": `
        import { Hono } from 'hono';
        const app = new Hono();
        app.get('/', (c) => c.text('Hello from Hono!'));
        export default app;
      `,
      "package.json": JSON.stringify({
        dependencies: { hono: "^4.0.0" }
      })
    }
  });
  return { mainModule, modules, compatibilityDate: "2026-01-01" };
});
```

### @cloudflare/codemode — Agent Code Tool

```javascript
import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { createCodeTool } from "@cloudflare/codemode";

const executor = new DynamicWorkerExecutor({
  loader: env.LOADER,
  globalOutbound: null,
});

const codemode = createCodeTool({
  tools: myTools,
  executor,
});

return generateText({
  model,
  messages,
  tools: { codemode },
});
```

### @cloudflare/shell — Virtual Filesystem

```javascript
const result = await executor.execute(
  `async () => {
    const hits = await state.searchFiles("src/**/*.ts", "answer");
    const plan = await state.planEdits([
      { kind: "replace", path: "/src/app.ts", search: "42", replacement: "43" },
      { kind: "writeJson", path: "/src/config.json", value: { version: 2 } }
    ]);
    return await state.applyEditPlan(plan);
  }`,
  [resolveProvider(stateTools(workspace))]
);
```

Backed by R2 (object storage) + SQLite for persistent state.

---

## Helper Libraries Summary

| Library | Purpose |
|---------|---------|
| `@cloudflare/codemode` | Wraps model-generated code execution; replaces individual tool calls with a single `code()` tool |
| `@cloudflare/worker-bundler` | Resolves npm dependencies + bundles TypeScript at runtime via esbuild |
| `@cloudflare/shell` | Virtual filesystem with typed state operations (search, edit, write) inside a Dynamic Worker |

---

## Pricing

| Component | Cost |
|-----------|------|
| Per unique Worker loaded per day | $0.002 |
| CPU time | Standard Workers pricing |
| Invocations | Standard Workers pricing |

**Beta note:** The $0.002/Worker/day charge is **waived during open beta**. Pricing subject to change.

For AI agent use cases, Cloudflare notes the per-Worker cost is "typically negligible compared to the inference costs" to generate the code.

---

## Competitive Landscape (2026 Sandbox Market)

| Solution | Isolation | Cold Start | Session Limit | Language | Best For |
|----------|-----------|------------|---------------|----------|----------|
| **CF Dynamic Workers** | V8 isolate (5-layer) | ~1ms | 30 min | JS primary | High-throughput, low-latency agent code |
| **E2B** | Firecracker microVM | ~200ms | 24h | Any | General agent sandboxing, long tasks |
| **Vercel Sandbox** | Firecracker microVM | ~125ms | 45 min | Any | Vercel ecosystem, Next.js apps |
| **Fly Sprites** | Firecracker VM | 1-2s | Unlimited | Any | Persistent environments, stateful agents |
| **Modal** | gVisor containers | Variable | 24h | Python-first | GPU workloads, ML inference |
| **Daytona** | Stateful sandboxes | <90ms | Persistent | Any | Dev environments, long-lived tasks |

### Where Dynamic Workers Win
- **Throughput**: Unlimited concurrent isolates, 1M+ req/sec
- **Latency**: Millisecond cold starts (10-100x faster than alternatives)
- **Memory efficiency**: 10-100x less memory per sandbox
- **Cost**: $0.002/Worker/day (negligible for AI workflows)
- **Edge distribution**: Runs in all Cloudflare PoPs globally

### Where Dynamic Workers Lose
- **Language support**: JavaScript-first (Python/WASM supported but slower startup)
- **Session duration**: 30 min max (vs 24h for E2B, unlimited for Fly Sprites)
- **Isolation strength**: V8 isolates have larger attack surface than Firecracker microVMs
- **Ecosystem maturity**: New (open beta) vs E2B's proven production track record
- **No GPU**: Can't run ML inference workloads
- **No persistent state**: Ephemeral by default (shell library provides R2-backed persistence)

---

## Relevance to Sunder

### Direct Applicability

Sunder uses **Sprites (Fly.io)** for agent sandbox execution (switched from Vercel Sandbox as of 2026-03-27). Dynamic Workers are not a replacement — Sprites offer stronger isolation (Firecracker microVM), persistent state, unlimited session duration, and any-language support.

**Why Sprites wins over Dynamic Workers for Sunder:**
- Firecracker microVM isolation > V8 isolates for running untrusted agent code on real client data
- Persistent environments — agent state survives between runs (no rebuild)
- No session time limits (vs 30 min for Dynamic Workers)
- Any language, not just JavaScript
- Sunder doesn't need 1M req/sec throughput — we need reliable, safe, stateful execution

### The "Code Mode" Pattern Is Interesting

Regardless of runtime choice, the **code mode pattern** (agent generates a single function instead of sequential tool calls) is worth exploring for Sunder's runner. An 81% token reduction would significantly impact costs. This is independent of which sandbox runs the code.

### Watch For

- Dynamic Workers graduating from beta with stable pricing
- `@cloudflare/codemode` maturity — could integrate with Vercel AI SDK
- Whether Vercel responds with comparable isolate-based sandboxing
- Community adoption and real-world security track record

---

## Sources

- [Cloudflare Blog: Sandboxing AI agents, 100x faster](https://blog.cloudflare.com/dynamic-workers/)
- [Cloudflare Docs: Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/)
- [Cloudflare Docs: Getting Started](https://developers.cloudflare.com/dynamic-workers/getting-started/)
- [Cloudflare Changelog: Dynamic Workers open beta](https://developers.cloudflare.com/changelog/post/2026-03-24-dynamic-workers-open-beta/)
- [VentureBeat: Cloudflare's new Dynamic Workers ditch containers](https://venturebeat.com/infrastructure/cloudflares-new-dynamic-workers-ditch-containers-to-run-ai-agent-code-100x)
- [A Thousand Ways to Sandbox an Agent](https://michaellivs.com/blog/sandbox-comparison-2026/)
- [Better Stack: 11 Best Sandbox Runners in 2026](https://betterstack.com/community/comparisons/best-sandbox-runners/)
- [DEV Community: Build Blazing Fast AI Agents with Dynamic Workers](https://dev.to/mechcloud_academy/build-blazing-fast-ai-agents-with-cloudflare-dynamic-workers-a-deep-dive-and-hands-on-tutorial-2mg7)
