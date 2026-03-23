# Building an Open Lovable - part 1

> **Source:** https://opencomputer.dev/guides/building-open-lovable-part-1
> **Repo:** https://github.com/diggerhq/opencomputer
> **Author:** Mohamed Habib, CTO Digger
> **Date:** March 11, 2026

---

This is a series about building a Lovable clone to learn how Lovable works under the hood. You can test the final result here. You will need to grab an opencomputer API key and an Anthropic API key to test this demo. You can also check out the code on github. Let's dive in!

## The early days - how agents were built back then

A few years ago, in the early days of GPT, all we had were LLMs and APIs around them; not much of the infrastructure or patterns had been established. The way you would build something like Lovable was by scaffolding a lot of workflows around the LLM to make it happen. Lovable is a complex beast, but at the heart of it, we are generating a React app and previewing it. At the center of it, we have the user prompt, "I want to create a todo app." This would then get appended to a system prompt in order to start generating the code in a structured way, file by file, with the LLM writing it to the file system. Of course, our precious LLMs have limited context windows that we need to respect. So we can't just keep looping with an ever-growing context window. We need a lot of workflows and context engineering around it. Basically, we need to break the larger task of creating a React codebase into smaller subtasks to keep the context under control. Each subtask needs to have the right context injected and the ability to query it (yep, something like RAG to inject context). This is the part people now refer to as the agent loop, or the "harness."

So that's the first part: the agentic loop. As code gets generated, it also needs to be written to files so that we can generate the preview. To keep our backend secure, this code gets written to a remote, isolated container somewhere. The container can serve this code as a web service, and it is embedded into the application so that users can preview their creations. Yes, as you guessed, this is the part we now refer to as the sandbox.

### The early pattern

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   User Prompt ──► System Prompt + LLM                   │
│                   "make me a todo app"                  │
│                        │                                │
│                   context engineering                   │
│                        │                                │
│              ┌─────────┼──────────┐                     │
│              ▼         ▼          ▼                     │
│         Subtask 1  Subtask 2  Subtask N                 │
│        generate   generate     ...                      │
│         App.tsx    styles                                │
│              │         │          │                      │
│              └─────────┼──────────┘                     │
│                        │                                │
│                        ▼                                │
│                   File System                           │
│                  write to sandbox                       │
│                                                         │
└─────────────────────────────────────────────────────────┘

Each subtask needs the right context injected and the
ability to query it. This is what people now call the
agent loop or the "harness".
```

During the early days of Lovable, these terms and patterns were not established at all. Everything was brand new, and people were figuring these concepts out from scratch. I don't think sandboxes even existed as a category back then. We also certainly did not have "harnesses" such as Claude Code at our disposal, so we had to create our own. Maybe we could add LangGraph, an amazing library that allowed us to assemble these agentic loops, workflows, and LLM tool calls to DIY a solution like the above.

As a result of how early we were, patterns emerged in a certain direction. We had the sandbox as an isolated concept, and we had the agent loop living somewhere else, doing its thing with the LLMs and eventually handling the code generation and writing to the remote sandbox.

Today we have ready-made harnesses that we can plug in to make our lives easier. While they come with their drawbacks, they are very good most of the time and can do the job. In many cases, you can get very far by reusing a harness such as the Agent SDK instead of rolling your own.

We have a similar story for sandboxes. Many sandboxes started as disposable places to run some code and then get destroyed quickly. "Run AI code" was the theme of these sandboxes.

As a result of how these two categories evolved, we traditionally ran the agent loop somewhere else and then had it communicate with a remote sandbox to run code, write files, and so on. This decision made sense back then, but I don't think it makes sense today. With sandboxes becoming more established, it makes sense to run our agent loop inside the sandbox. This gives us a lot of benefits: 1/ it is simpler to manage one component, 2/ there is less latency when it comes to reading and writing files.

### Before — separated

```
┌──────────────────────────────┐
│         Your Server          │
│                              │
│  ┌────────────────────────┐  │
│  │      Agent Loop        │  │
│  │  LLM calls, tool use,  │  │
│  │         RAG            │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │  Context Management    │  │
│  │  langgraph / custom    │  │
│  └────────┬───────────────┘  │
│           │                  │
└───────────┼──────────────────┘
            │
     network calls,
       latency
            │
┌───────────┼──────────────────┐
│           ▼                  │
│     Remote Sandbox           │
│                              │
│  File System + Preview       │
│  ephemeral, dies on timeout  │
│                              │
└──────────────────────────────┘
```

### Now — unified

```
┌──────────────────────────────────────┐
│         OpenComputer VM              │
│                                      │
│  ┌────────────────────────────────┐  │
│  │      Claude Agent SDK         │  │
│  │    harness + agent loop       │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │        File System            │  │
│  │  read/write instantly,        │  │
│  │  no network                   │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │      Preview Server           │  │
│  │  served from same VM          │  │
│  └────────────────────────────────┘  │
│                                      │
│  hibernates when idle,               │
│  wakes in seconds                    │
└──────────────────────────────────────┘
```

OpenComputer helps here by giving users a long-lived sandbox environment to run agent loops inside. The sandboxes hibernate and wake up quickly, so they never really die. We are going to build our open Lovable clone around OpenComputer. Since this is being written in 2026, we are going to package a ready-made harness - Claude Agent SDK - into a sandbox and have it do its thing with the agentic loop, while we surface its thinking to users as it goes. Similarly, we will serve a preview of the app right from the same sandbox VM.

Our setup is so simple that all it takes is a React app to build the most basic clone of Lovable — no servers needed!

## Building the open lovable step by step

So the user just typed their prompt to create the generated app. What next? Let's go through it step by step.

### The 4-step flow

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│      1      │   │      2      │   │      3      │   │      4      │
│   Create    │──►│   Start     │──►│   Stream    │──►│  Follow Up  │
│  Sandbox    │   │   Agent     │   │   Events    │   │             │
│             │   │             │   │             │   │  same       │
│ OpenComputer│   │ Claude Agent│   │ tool calls  │   │  session,   │
│    SDK      │   │    SDK      │   │ + thinking  │   │  multi-turn │
└─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘
```

### 1/ Create the sandbox

Of course, since without the sandbox we have no place to run our agent!

```typescript
// sandbox.ts

// Create the sandbox via OpenComputer SDK
const sandbox = await Sandbox.create({
  template: "default",
  timeout: 600,
  apiKey: settings.apiKey,
  apiUrl: settings.apiUrl,
  envs: { ANTHROPIC_API_KEY: settings.anthropicApiKey },
  memoryMB: 1024,
  cpuCount: 2,
});

// Create a preview URL for the sandbox's port 80
const preview = await sandbox.createPreviewURL({ port: 80 });
const previewUrl = hostname.includes("nip.io")
  ? `http://${hostname}:8081`
  : `https://${hostname}`;

// Scaffold the Vite project and start the dev server
// (we do this so we have a placeholder app to display while our agent is cooking)
await scaffoldProject(sandbox);
```

```
┌────────────┐  ┌────────────┐  ┌────────────┐
│   2 vCPU   │  │  1 GB RAM  │  │  Port 80   │
│  compute   │  │   memory   │  │ preview URL │
└────────────┘  └────────────┘  └────────────┘
```

### 2/ Start a Claude Agent SDK session

Conveniently, OpenComputer gives us a nice abstraction around that too:

```typescript
// agent.ts

const session = await sandbox.agent.start({
  prompt,
  systemPrompt: SYSTEM_PROMPT,
  maxTurns: 30,
  cwd: "/workspace",
  onEvent: handleEvent,
});
```

Oh, by the way, this is our system prompt in case you're curious. The prompt is what the user inputs.

```
┌──────────────────────────────────────────────┐
│          Inside the agent session             │
│                                              │
│  ┌──────┐  Prompt                            │
│  │  P   │  User's request + system           │
│  └──────┘  instructions                      │
│                                              │
│  ┌──────┐  Max Turns                         │
│  │  30  │  Up to 30 agentic iterations       │
│  └──────┘  per request                       │
│                                              │
│  ┌──────┐  Working Dir                       │
│  │  /   │  /workspace — where the code lives │
│  └──────┘                                    │
│                                              │
│  ┌──────┐  Event Stream                      │
│  │  fn  │  Real-time tool calls + thinking   │
│  └──────┘  to UI                             │
│                                              │
└──────────────────────────────────────────────┘
```

### 3/ Stream events back to the UI

Now the `agent.start` interface also allows us to stream back all the tool calling and thinking happening within our agent loop, which is running in our sandbox. So we get back all these messages, which we can then display nicely to the user. This is what our `handleEvent` callback looks like:

```typescript
// events.ts

const handleEvent = useCallback((event: AgentEvent) => {
  switch (event.type) {
    case "assistant": {
      // Extract text blocks and tool_use blocks from the assistant message
      const content = event.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text") {
            resetToolAccumulator();
            addLog("assistant", block.text);
          } else if (block.type === "tool_use") {
            addOrUpdateToolSummary(block.name, block.input);
          }
        }
      }
      break;
    }
    case "turn_complete":
      // Agent finished its turn — resolve the promise so we can scan files
      if (turnResolveRef.current) {
        turnResolveRef.current();
        turnResolveRef.current = null;
      }
      break;
    case "error":
      addLog("error", String(event.message));
      break;
  }
}, []);
```

#### Event types your UI handles

| Event | Type | Description |
|-------|------|-------------|
| `assistant` | `text` | LLM thinking and responses displayed to the user |
| `assistant` | `tool_use` | File writes, shell commands, code generation in progress |
| `turn_complete` | `done` | Agent finished — refresh preview and fetch file tree |
| `error` | `error` | Something went wrong, surface it to the user |

And once the agent signals that it is done with `turn_complete`, we do the final refresh from the preview URL and fetch all the files so that our file browser can show them to the user.

### 4/ Follow up requests and conversations

For follow-up requests from the user, we do the same process while ensuring that all follow-up messages use the same Claude session for context reasons. Once again, we leave the message history and context management to Claude Agent SDK.

```
Multi-turn conversation
──────────────────────────────────────────────────────

  user    "make me a todo app"
            │
  agent   creates App.tsx, TodoList.tsx, styles.css
          ... done
            │
  user    "add dark mode and a filter dropdown"
            │
  agent   modifies styles.css, updates App.tsx
          ... done
            │
  user    │
            │
  same session, full context preserved across turns
```

## Summary and next parts

So we've implemented a basic Lovable clone using the Claude Code harness and OpenComputer in this guide. We are able to retrieve and display the basic URL and have multi-turn conversations with the user. In the next parts, we will cover different aspects of making this basic prototype better:

1. How to deal with longer conversations and context compaction
2. How to allow users to deploy their creations and share them with others - including private URLs
3. Dealing with more complex apps that have a backend, DB, and auth, generating them for users, and supporting integrations with other APIs (which is where the Lovable magic is)
4. Customizing the harness and creating your own so that you can roll your own agent loops and have more control over how things work during code generation

Stay tuned!
