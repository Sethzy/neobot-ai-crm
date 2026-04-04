# Vercel Workflow Development Kit — Workshop

**Speaker:** Vercel engineer (workshop lead) + team members assisting
**Event:** Vercel Ship 2026 (Workshop session)
**Topic:** Hands-on — converting a coding agent into a workflow-backed coding agent

---

## Summary

This is a hands-on workshop where attendees convert an existing AI coding agent (a vibe-coder that generates files and renders them in an iframe) into a workflow-backed agent using the Workflow Development Kit. The workshop walks through five incremental steps, each with its own Git branch checkpoint:

1. **Adding workflow** — Install `workflow` + `add-workflow`, extend the Next.js compiler with `withWorkflow`, pull the agent loop into a `use workflow`-tagged function, swap `agent()` for `durableAgent()` (which wraps LLM calls as steps automatically), and mark each tool's `execute` function with `use step`. Start workflows via `start()` from `workflow/api`. Result: identical local behavior, but deployed code gets per-step isolation, retries, caching, and observability for free.

2. **Streaming** — Use `getWritable()` to get a workflow-scoped stream (backed by files locally, Redis/etc in production). Write data packets from inside tool steps so the UI can display progress. Streams are **not bound to the API handler** — they persist independently, enabling reconnection.

3. **Resumable streams** — Return the `runId` to the client. Create a second API endpoint (`/chat/[id]/stream`) that calls `getRun()` and returns the existing stream from a given offset. Add client-side transport middleware to detect existing `runId` and reconnect instead of starting fresh. Result: if a user loses connection, they can resume the stream mid-workflow.

4. **Sleep** — Add a `sleep` tool that calls the workflow-exported `sleep()` function. The agent can now pause for arbitrary durations (seconds to months), consuming zero resources. Under the hood, sleep throws a retriable error. Useful for building cron-like agents (`while(true) { sleep('1 day'); doWork(); }`).

5. **Webhooks / Human-in-the-loop** — Add a tool that creates a webhook via `webhook()` from the workflow library. The webhook generates a unique URL, suspends the workflow until that URL is hit, then resumes with the request payload. Supports `respondWith` for full API request handling and result schema validation.

**Key Q&A takeaways:**
- **State persistence:** Every step's inputs/outputs are cached in an event log. On resume, the workflow replays from the event log without re-executing completed steps.
- **Deployment isolation:** Each deployment gets its own URL namespace; workflows on old deploys run to completion. An upgrade mechanism checks step signature compatibility for in-place migrations.
- **Concurrency:** Currently infinite (each workflow = separate serverless instances). Per-workflow and per-step concurrency limits coming soon (useful for free/pro tier gating).
- **Step rollback:** Not yet supported but architecturally feasible since all step I/O is cached.
- **Observability export:** OpenTelemetry span export to Datadog etc. is planned. Currently has first-party web UI + API access.
- **Secrets:** Steps run in the same deployment environment, so `process.env` works normally. End-to-end encryption for stored step data is planned.
- **Platform independence:** Frontend supports Next.js, Nitro, Hono, and more. Backend adapters are open source — Postgres adapter exists, community can build custom adapters for any storage/queue layer.
- **Beta status:** In beta, 1M+ workflows/day internally. GA coming with stable API, versioning UI, concurrency controls, and migration tools.

---

## Transcript

Thank you all for coming. Hello. Hello.

I don't know about you, but when I write agents, I like focusing on the capabilities and the features, and I like not thinking about all of the extra effort that goes into getting something that works locally into production.

And something that's very useful for that is a workflow pattern. And that's why we developed the Workflow Development Kit, which is what we're talking about today. Presumably if you're here you've had similar issues. And today we are going to turn an agent — a coding agent — into a workflow-supported coding agent throughout this session.

So — we have an open-source example ready to go. This is on the `vercel/examples` repository. You can clone that and check out the VIP coding platform app. We're going to be using this app for today's demo. And after we're done, we get first-class observability built in and also durability and reliability. We get a lot of extra features like resumability, and the dev kit makes it very easy to add human-in-the-loop workflows and similar things.

So if you think about our general agent loop that we've all seen before, we mostly have calls back and forth from an LLM to tool calls and our backend code, right? Which would include MCP servers, human approval, any kind of async tasks.

And the usual way to go about this is to wire up some queues and a database, especially if you are doing long-running agents, right, that might run for hours. And you want to scale and you're running on serverless, for example — you want some kind of reliability layer in between, which usually is filled by queues. And then you'll also need to add a lot of error and retry code, you'll need to store all the messages that people are sending and also between states, and you probably also need to add some kind of observability layer in between.

All of those things we are going to do today using only a single library — the Workflow Development Kit. It's open source and it runs with any of your TypeScript frontends or backends and can also run on any cloud. We're going to be deploying to Vercel today, but this could just as easily run on any of your cloud stacks or any of your custom stacks.

All right, so who here has heard of the workflow pattern or has used a workflow library before? Show of hands. All right, that's less than half. I'm going to quickly explain what a workflow pattern is to make it clear what we're doing and then in about 2 minutes we're going to go into the code.

A workflow pattern is essentially a sort of orchestration layer that separates your code into **steps** that can run in isolation and can be retried and have their data persisted, and an **orchestration layer** that we call a workflow (other platforms have different names for that).

In our case here, the workflow part would be whatever the loop is that calls the LLM calls and then goes back to the tool calls and then back to the LLM calls. And the steps would be our actual tool calls and our LLM calls.

Right, so looking at the agenda for today — we're going to be jumping into the code. We're going to add Workflow Development Kit, which is going to be quite fast, and then we have a lot of time to talk about cool additional features that it adds, like resumable streams out of the box, how to suspend and resume at any point, and how to add webhooks for human-in-the-loop processes. At the end there's going to be ample time for Q&A, but there is a reason that you're here in the workshop and not looking at this online, which is that you can ask questions. Please do so at any point. Feel free to raise your hand or just shout out the question.

---

### Setting Up

All right. So as I said, we're working off the base example repository and we're going to be working off the `conf` branch. Why this branch? I stripped a bunch of the access code on the example to make sure that we can focus on the most important parts. And every checkpoint from this workshop will have its own branch. So if you're not coding along directly, you can also check out the steps step by step and then check the diffs and see what changed between.

All right. So I have already run `npm dev` locally on this platform just to show you what it looks like. I'm going to run a simple query. So this is a coding agent, right? It's like a code editor but without the code editing — it can take a prompt, generate some files, and it'll eventually show you an iframe with the finished app that is deployed. So it's mostly UI with a few simple tool calls that we'll look at in a second. And the file system and output runs over Vercel Sandbox, but you could just as easily run this locally.

Looking at the code — I'm going to go and check out our actual branch. Looking at the code, we have one endpoint that accepts our chat messages, right? Then it does some regular sort of model ID checking to see whether the model is supported. And in the end it's going to simply create an agent.

> **Audience:** What was that branch one more time?

The branch was `conf`. Yeah. And you can see we'll move on to `conf/2-*` etc. Just look for the numbers and you'll find all the checkpoints.

So our main endpoint just accepts some messages and calls the AI SDK agent, which is essentially the same thing as a `streamText` call. We'll pass some tools and internally it'll just loop — `streamText` call, `streamText` call — and then it'll stream all of the chunks generated back to the client in a format that is easy for the client to understand. This is all sort of AI SDK regular code that you could replace with a different library if you want. That is mostly there to support the UI. But again, all of the actual agent stuff is very simple and happens here.

So — let's also take a look at the tools that we have. We have four tools: `createSandbox`, `getSandboxUrl` — these are very simple, they just wrap `sandbox.create` and `getUrl` — and similarly `runCommand` essentially wraps `sandbox.runCommand`, and `generateFiles` will generate a file from a simple prompt.

Let's take a look at one of these tool calls as an example. We have a prompt that looks somewhat like a markdown file — sort of what to do, what not to do. And back to the tool call — we also have an input schema that's a Zod schema for what the AI is supposed to pass. This is all very standard. And then an `execute` function which wraps `sandbox.runCommand` with some error handling.

So that's essentially our entire agent code setup, and then in the frontend we just call `useChat` from AI SDK to consume the stream and display things in the UI.

---

### Step 1: Adding Workflow

So let's get started adding workflow to this. Any questions before I get started? Cool.

All right. Step one — we're going to run `npm install workflow add-workflow` which will give us the latest version. `workflow` is the main library and `add-workflow` are some helpers — some wrappers that work well with the Workflow Development Kit.

So now that we have this installed, we are running a Next.js app here. So we're going to extend the compiler to compile workflow code by doing `withWorkflow`, which we can import from `workflow/next`, and that'll set up Next.js.

> **Audience:** Verifying question — you are in the example applied coding directory?

Yes.

So adding this will let the compiler know to also compile our workflow code separately, which we'll get into more in a second. And then for convenience, we can also add a TypeScript plugin to our TS config — same package — and that'll give us some better autocompletion for our workflow code.

So we talked about a workflow having an orchestration layer and having a number of steps. What we're going to do first is write the orchestration layer. In our case, that is essentially just the agent, right? It does the loop that calls steps back and forth. We're going to add a new file — you can call it whatever you want — and we're going to take our agent call and move it over there.

I'm going to call this our "code workflow," which is going to be all of our workflow code. And then I'm going to auto-complete a bunch of imports. Thank you, AI. So we're just passing most of the arguments that we would otherwise get from here over there. And this completes the refactor — essentially having done nothing but pull out some of the workflow code into our file.

So this is where it gets interesting. Now that this is a separate function, we can use the `use workflow` directive, which will mark this for our compiler as a workflow function. What this does under the hood — it compiles all of the code related to the function into a separate bundle and it ensures that there are no imports to anything that would have side effects, because the workflow orchestration layer needs to be deterministic. So it can be rerun in a deterministic fashion and there's no worries about state pollution.

So now that we have this, we need to mark our LLM calls as steps. And because the calls are happening inside the agent, this is a little bit harder to do here. So we ended up writing a **durable agent** class which is essentially the same thing as `agent` with a `use step` marker in the actual LLM calls that it does under the hood.

So now that we have this set up, we're going to await the actual streaming. And — we need a stream to write to. Previously we could just write to the stream that the API handler gave us. Now we're going to have to create a new stream to write to. We export a `getWritable` function from workflow which gets a stream implicitly associated with the workflow to write to. And we're going to get into that a little bit more in a second. But for now, we'll just pass that to our agent.

And then finally, back in our actual API route, we need to call our workflow in a way that the framework understands — which for us is a call to `start` with the arguments being passed separately. This is essentially telling it to start a new workflow on this function. `start` can be imported from `workflow/api`.

So now we essentially have the workflow fully hooked up and a lot of this was just pulling out some of the code and adding a directive.

And finally, this `start` call returns a run instance that has the stream — we can return that to the UI. So this completes our workflow definition.

Now we also said that we would need to mark things as steps. The durable agent class already marked the LLM calls as steps. But our tools right now are not marked as steps. Thankfully, this is very easy. In the `execute` function for each of these tools, you can just write `use step` and that will let the compiler know that this is a separate chunk of code to execute in a separate instance.

Right? If this is deployed to production, this would run in a separate serverless instance and the inputs and outputs would be cached if it already ran and it would be retried if it failed.

So I'm going to go through the other tool calls and also add `use step` to these. Thankfully we only have four of them.

And that should complete our transformation. So now we can go and run `npm dev`. See if this works as expected. We're going to reload our page. And — it seems like nothing changed. Let us actually run a query. And we can see that it's still streaming as expected.

So for us developing locally, all we had to do is pull out a function and then add some directives. But now if I deploy this to any adapter — again, Vercel or an AWS adapter or maybe you have your own — this will run in isolation with durability and all of those good things.

And something that's really nice for local development also is that if I go into the same folder here and I run `npx workflow web`, which is this CLI call to start a local web UI to inspect our runs — you can see that our run is currently still running. And every step — everything that is marked as a step — will have a span here and you can inspect the inputs, the outputs, and any associated event. And we can see that our workflow just completed, I think, and yeah — this gets built in.

> **Audience:** And just for clarification — every time you're prompting your vibe coder, that is one instance of the workflow that runs to completion?

Exactly, yeah. And you could model this in any way you want. You can also model your entire user session as one workflow and have the workflow sort of do a loop, wait for the next query, and then — again, you know, we can run code for weeks if we need to, essentially. And I'm going to go into some tools for that in a second.

---

### Step 2: Streaming

So now that we have this set up, you can see that on the right side we do not get any sort of helpful feedback. But if I visit this link and see that our app has likely been created correctly — or it failed because of some errors — either way, we're not getting any output on the right side.

The reason this is happening is that we are streaming the agent output to the client but our tools aren't actually doing any stream calls right now. So what we could do is — similarly in our tool calls — we could get the writable, which will get the same writable instance as any other part of the workflow itself.

There is an infinite amount of streams you can create and consume in a workflow. And you can tag them with a certain name and then fetch them from there. But this will get the default instance. And once we have a writable, we can actually connect to the writable by getting the writer.

And now we can write any kind of information to the UI to be consumed. I think we want something like `data: createSandbox` — I think that's what I hooked up in the UI — and then we'll pass the sandbox ID.

So this is me just writing a data packet that our UI knows how to consume. So now that I did this and I reload the app and start this again, we'll see that at least the sandbox create call presumably gets filled in correctly at the start.

> **Audience:** You said that there are streams that you can create — what do you mean by that?

So a stream — the workflow sort of — the adapter we use for workflows — in local development, this would just be a file. In production, this might be a Redis instance. It supports the workflow calling it to create a new stream — for example, in Redis — and then passing that stream back. So anytime you call `getWritable`, it'll create a stream — for example, again in Redis — with the ID of that workflow and it'll pass that. So any step can attach to that and any client can attach to that. And in localhost, this would be written to a file and read from a file.

> **Audience:** So previously we had an API handler that took some messages, called the agent, and then streamed back messages from that API handler. Now we have an API handler that starts a workflow and it'll pass back the stream that this workflow creates?

Right. And something this allows us to do — a good point — is that the stream is not bound to the API handler. This means that at any point we can resume this stream. If you lose connection to your API handler and then the user reconnects, this stream still exists and we could reconnect to the stream to resume the session. This is also part of the durability aspect — everything you do in a workflow, you can resume at any point.

I'm going to restart this query and hope that it works this time. Yeah. So now that I hooked up this data packet, you can see this special UI handling for creating a sandbox works. But even after it's done, it's not showing up that it's done. This is because we're only writing the initial loading state packet.

So I could go through all of our tools and add more packets and just make the UI richer. But I'm going to go and check out a different branch — `conf/2-workflow` — which already has all of these `writer.write()` calls populated. There's no difference otherwise.

So now that all of our tools have these write calls, the stream would again presumably look the same as it did when we started out in this app.

---

### Step 3: Resumable Streams

All right. So now that we have streams working again, everything is working as expected and we have more observability and we can deploy this with durability. I talked about resumable streams before. We're going to see if we can get this stream to resume so we have durable sessions.

The only thing we need to do to make that work is to go to our API endpoint. Where we get the run instance, we're also going to return the workflow ID as additional information. So I can return `run.runId`, for example. This is just — again, any way you do this is fine. I'm adding it as a header here because we're already returning a stream. But anyway you pass the ID to the UI is something that the UI can then use to resume the stream from.

So what we do from here is — the UI should be able to decide whether it has a run ID and whether it should resume a stream. So we're going to go and create a new endpoint. Let's call it `[id]` for the dynamic route, then we're going to make a folder `stream` and add a route handler.

So this is just Next.js configuration for adding an API route at `/chat/[id]/stream`. And we're going to auto-complete with AI. What we're essentially doing is we get the ID from the params and then all we're going to do is call `getRun` in the workflow API, which gets the run instance, and then we can return the same stream that we return in the other endpoint — just without calling the actual agent. Only doing the stream.

We're also taking our start index, which is very helpful. We can get a readable stream from a certain start point. So if you're trying to resume a stream midway, you can pass which chunk you were on when you initially left off.

So now that this is done, we need the UI to support this conditional of whether to resume or whether to start a new chat. So I'm going to go to our chat frontend and pull in some code from a different branch for simplicity — it's on the `4-streams` branch.

We do a `useChat` call already in the UI to consume the stream. All we added now is a transport layer — this big block here — that has some middleware for the stream that says: if I'm trying to start this call, I'm going to check first whether we have an existing run ID, and if so, I'm instead going to do a reconnect by calling this different API endpoint. I'm sort of handwaving over this a little bit because it's client-side handling for the stream.

So that gives us resumable streams.

---

### Step 4: Sleep

And I'm also going to demo what if we wanted to deploy this and see it in production. So I'm going to call this and then we can check out a production preview example. In the meantime — the next thing we'll do is talk about events and resumability.

The workflows — because of the way they run — every step runs on its own serverless instance in production. The actual workflow orchestration layer is only called very briefly to facilitate step runs. What this allows us to do is to have a workflow suspend for any amount of time.

A workflow could wait for a week and not consume any resources. This is built into the Workflow Development Kit in a way where we can — inside a workflow, anything tagged with `use workflow` — simply call `sleep('3 days')`, for example, and that will pause the workflow for three days and then resume where we left off.

If someone was trying to reconnect to a stream, for example, right? If `sleep` was an hour, the stream would just reconnect again to the same endpoint and things would resume from there. So we don't lose anything by losing the instance that runs the code because we can always restart it, resume from where we left off.

And this is useful for AI agents because we can — as a tool call — have the AI agent call `sleep` for any amount of time and then use it to make an agent that essentially uses a cron job where it says "every day, read my emails and do this thing," right? So that would be `sleep('1 day')`.

> **Audience:** When the agent goes down, that means all the state goes with it, right?

> **Speaker:** When it sleeps — no. When it sleeps, it's paused.

> **Audience:** No, when it would be killed for some reason — where does the state go?

So the way it works is that any step call is cached. When an input goes to a step call, we register that as an event and we run the step. If the step completes, we cache the output and say "this step has been run to completion."

Right? So if it was something like this where we run the agent first — let's say we run the agent and we run a bunch of steps — the state of the workflow function at this point in time would be saved and all of the outputs from all of the step calls would be saved. And at the time where we restart the workflow from this specific line of code, it'll rehydrate the entire state and it'll just go from here.

And this happens so that we don't have to replay any of the code in a way that does any actual resource consumption.

So we can use this to make an agent that essentially has a cron job. And we can use it to make agents that run for weeks or interact with any of your information over a very long time horizon.

And while I've been talking, we have deployed our current app to Vercel. So I can check out this preview branch, for example, and you can see the app is now live online and working just as it usually does. And yes, it works perfectly.

And if I then — again I can use the UI to inspect this at any point. If I call `workflow inspect web` or just `workflow web` with the `--backend vercel` and `--preview` parameters, for example, that'll just let it know where our deployment is to be found, and then that'll spawn up the same UI and now we can check on this run that's running in production. And you can see we're getting the same kind of information here.

So — this is to show that the way it works locally is the exact same way that it works in production from a conceptual standpoint, which is the UX we are aiming for.

All right. I talked a little bit about sleep and suspend. Let us go and write this sleep tool call. It's going to be very simple. I'm going to write a `sleep.ts`. We're going to turn down the input schema to be something like `timeoutMilliseconds` and the actual execute function to just call `sleep`.

Because `sleep` is already a step that we export from the workflow library, we don't need to mark this function as `use step`. But this will now—

> **Audience:** Can you say that again? Why don't you need `use step`?

So `sleep` is already a step that we export from workflow. It's going to show in the observability as a step, which we'll see in a second.

And this should just work assuming the prompt is good, which we're going to modify to be something like — "Only use this tool if the user directs you to do so." All right.

So now that this sleep call is set up, that should be all that we need to do. We'll call it `runSleepCommand` — the sleep tool. And we're going to add this to our tools list. And I think I confused our compiler a little bit, or at least TypeScript. This seems to work great. Okay, now we have the tool.

And we also want the UI to sort of display when it's sleeping. So I'm going to add another call to writable. The reason we're doing this is we cannot write to a stream directly from a workflow because then it wouldn't be deterministic anymore — every run of the workflow would write to the stream again.

So here I'm just going to add another call to writable and let the stream know we're sleeping, with a local ID.

Let me see if I configured the UI to correctly interpret this packet. All right.

So now that I have this, I can go start our app again. And so it loads. We can try out the second prompt here — "sleep for 30 seconds and then return" — just to show that it's going to correctly interpret the sleep call and then sleep.

It's not showing the data packet here sadly, but we can go to the web UI and we can show — it has been — it's engaging in the sleep call and this is going to return after 30 seconds.

---

### Step 5: Webhooks / Human-in-the-Loop

All right, so that's sleep. And there's one final feature that I want to show you, which is **webhooks** and the ability to resume from webhooks easily.

Implementing webhooks is usually quite difficult or a headache. And in our case, I'm going to check out the `conf/5-hooks` branch and show you that we can, in the same fashion as we do sleep, add a new tool.

I'll just show you where the actual tool call is — just a log call, and then we create a webhook, which is a function we export from the workflow library. And we can then log the webhook URL to the client or anywhere else and `await webhook`. This will suspend for as long as necessary until someone clicks on this URL and then resume.

Let's see if we can get the server running and I can show you this. Reload this and — "Wait for human approval before starting, and call Pokémon index."

Let's see if I set this up correctly. I've been changing branches, so I might need to restart my server.

And the way this works under the hood is that again we'd be creating a URL and we're going to sleep the workflow until a call comes into that endpoint. And this comes with a lot of extra features — like I could also do `respondWith` if I wanted to. This is a full API request handler. I could respond with a request object. I can treat this as an API endpoint. I could also check the body against a result schema, for example, and then only resume once that matches.

So this gives you full control. But the nice thing is it does hook up the URL internally. And you can see that it's paused — waiting for a human to click on this link. If you're running on localhost it's a localhost link; running in production, it will be whatever your deployment URL is.

> **Audience:** About both sleep and human approval — a workflow is purely steps, and steps always run to completion, right? So sleep is a step — it's not like a suspension of the execution?

No, it is. We model it as a step in terms of the observability and how you call it, but it is an internal feature that completely suspends the workflow. All steps — nothing is running while it sleeps.

You can also do sleep and another step and you can `Promise.race` them if you want. It works as a step call in that sense that it's an execution that takes a certain amount of time. And you can use promise/await syntax to model that, but again — it completely suspends unless there is anything else running at the time. And the same for the webhook — it's modeled as a step for the observability, but it completely suspends unless you have other code running at the time.

> **Audience:** So just from my understanding — if you have an agent running with a workflow, it keeps running. You connect to it again, let's say through another session, and you call sleep in this session — does the previous one just go down?

So if you have two sessions — let's say we have a coding session and it already built an app and then it's sleeping for a week, and then we reconnect to the stream—

> **Audience:** No, the thing is — let's say I kick off a workflow and it's calculating the digits of pi, just keeps on going, right? But I connect to the same sandbox and then I call sleep. Will it stop calculating pi?

So the way you would do this in a workflow is — let me see how we would code this.

> **Audience:** You have a sandbox there. Sleep in the sandbox. You connect again to the sandbox and some thread calls sleep. Does the whole sandbox go down?

So the sandbox is Vercel Sandbox, which is — just imagine it as an EC2 instance. This is just a helper for us to spin up an instance to run this coding agent, run the code in, store the files. If you model this differently you wouldn't have to use sandbox. And the sleep call doesn't happen as a bash call.

> **Audience:** Right, it's like an orchestration thing. When you're actually in the sandbox, you call sleep in a sandbox, you're—

Okay, so there are two different things. There is `sleep` that you could call from a terminal in the sandbox as a terminal command, and there's `sleep` from the workflow which suspends the workflow. Yeah.

So we have these features for webhooks, and we can see that after I clicked on the URL, it resumed and then coded me a Pokedex.

---

### Q&A

That is all of the features we're going to cover in the session and I think we have ample time for Q&A — about 20 minutes at least. Please go for it.

> **Q: How would I spin up a Claude Code session with this?**

A Claude Code session remotely — or are you—

> **No, kind of run and kick it off as an agent doing certain stuff. Is that possible? And then orchestrate that as agents?**

That is possible. Claude Code is — if you're talking about the app, like the terminal app, right? — Claude Code doesn't use a lot of the workflow features internally, so it's hard to isolate that or know where the orchestration layer is. You could write your own version of Claude Code, or take the Claude Code source code and add workflow and step for the calls, and that would then run as a workflow in the cloud.

> **There's no way to say like "okay I have my steps, spin up Claude Code, type this command and wait"?**

That would be a Vercel workflow, but — if you're calling Claude Code in a sandbox, for a coding agent here, if the coding agent runs `make` — the `make` command runs in a step, but it runs against a sandbox, the sandbox being a VM. And so this VM state is not managed by the workflow itself. So if you call Claude Code on the VM, that's essentially treated like an SSH session. But if you run any agents or steps within the workflow, those steps are going to be resumable and observable through the workflow pattern.

---

> **Q: How do I control what my agent has access to — from going out to the internet, doing stuff?**

This would be whatever you're already doing for the agent, right? In the end you're going to be doing tool calls and stream calls to the LLM provider. That is in your code presumably already, and whatever you're already using to control permissions there — like your tool calls, for example. If your tool call allows you to delete a resource in S3, then you can write whatever code you want in the usual way.

> **So it's my job to implement it? It doesn't have some wrappers?**

Yeah, all in the sandboxes. Workflows is a general orchestration layer for durable execution and doesn't necessarily provide a sandbox for running code or running third-party code or running agent code or making files. That's something that the sandbox is good for because every sandbox instantiation is a new VM that only lasts for as long as your session lasts.

---

> **Q: If I'm running workflows and creating a lot of agent workflows — how does that get queued up on your system? How does that get run? Is there rate limiting or concurrency controls that we can use?**

Yes. So this goes into some of the patterns that are going to be supported — and for the most part are supported right now. If you're deploying, for example, to Vercel — as usual with Next.js, every deploy is a separate live URL, right? If you call it, it spawns up a serverless instance. And so your workflows are bound to the deployment.

Something very nice that you get here is — if you have an agent and it runs for a week but you deploy five times during this week, those new deploys are going to be isolated from the original workflow and the original workflow is going to run to completion. Then any new workflow will run on the new deployments.

And we'll also allow upgrading between those. So if you have a workflow that runs for a year — because it's like "every month give me a summary of so and so," right? — but you have new code and you want the workflow to take its current state and use the new code, there's going to be an upgrade button in the UI that checks for compatibility between the old workflow and the new workflow by checking all of the step signatures and all of the existing events, and then you can upgrade the workflow.

Or you can currently already cancel and rerun with the new workflow.

> **Is there a timeout for those workflow steps?**

Yes. If you're doing serverless, right, whatever platform you're on — whether it be Lambda or something else — your serverless functions are going to have timeouts. The nice thing is that every step runs in its own serverless function. So the timeouts only apply to the steps. So if one individual step runs the risk of running more than five minutes — maybe 15 minutes depending on platform — then you can split it into two steps. Or if it runs into the timeout, it'll fail, it'll retry, maybe the retry will be faster. And you'll see in the UI that "oh, this step is being retried after 15 minutes a bunch of times," right? Presumably because it's failing. And then you can go and split it into two steps, upgrade the workflow, and it'll just continue from there.

> **And the other point — around queuing workflows, like I trigger the agent a bunch of times. Does it get queued? How does that process work?**

You can model this in different ways. Right now we're doing this from an API route where every call to this API route will create a new workflow. That is mostly — the only interactable output you have is a stream in this case. It'll do things, it'll write to the stream. Nobody looks at the stream? We don't know if the workflow is running. You can kick off 10 of these, right? And they're going to be running in the background. There is essentially no limit to how many you can create because they all run in serverless functions. So you can scale for as much compute as there is in your provider — which is a lot.

And you can also list active runs, right? There's an API for interfacing with your runs — look at all of the runs that are running, look at which version they're on, what step they're on, cancel them.

The concurrency part — right now it's infinite concurrency. But very soon we'll add per-step or per-workflow concurrency where you can say "this workflow is only supposed to run at most 10 times at the same time" and any extra start gets queued so that it will wait for those 10 to reduce and then slide in.

You can also use that to have a free tier, for example, on your product — where there's 10 instances running for your free tier at any one point and some people that come in later will wait for the queue, but your pro tier has infinite concurrency.

---

> **Q: Can I roll back steps? Let's say I have 10 steps but in step seven I think "okay let's go back to step three." Would that be possible — to reset the state of the workflow?**

You can technically do this. We don't currently support it, but it would be very easy to implement because you have every step — again, the inputs and outputs are cached — and we can enter the workflow at any point and sort of replay from there. So we'd need to expose this in the UI as a function to resume from step so and so. But yes, that would be possible.

More likely what you want to do — because you control the workflow — is to use JavaScript: you might have to step into state or do something, just keep going.

> **Follow-up: If you go through the steps — you said you're passing input and outputs across and that's what gets cached. Is there a way to attach metadata, or does it always have to be in the input/outputs of the function?**

You can also attach metadata. We'll have a tagging API soon where you can add arbitrary tags to the workflow at any point in the workflow run, and you can use those tags also to maybe decide whether to early-exit or deduplicate your runs.

---

> **Q: About the deployment — are we tied to Vercel or is it possible to deploy elsewhere?**

As I mentioned before — there's two aspects to this. There's the frontend side of the framework. The docs are on `useworkflow.dev`. You can see for the frontend side — which is also sort of the API layer — we currently support all of these platforms, and more coming soon.

And then there's separately the deployment target, right? Next.js — you can deploy to anything right now. This would work with anything you can deploy Next.js to, for example, or any of these other frameworks. And we have a first-party implementation for a Postgres example that uses Postgres as the durability layer. And as we build this out and the community comes in, we'll have support for essentially any backend — because underneath, the TypeScript framework connects to any storage or queue layer. So anything that provides a database or a queue can be used as the backend for this.

> **Related question: for the observability — can we also export to Datadog or other providers?**

Yeah, so we have multiple things. We have an API that you can use to access data directly, and we also have open-source UI components that you can use to display it. And then you can export this to Datadog if you want.

---

> **Q: You talked about sleep a little bit and how it's essentially like a cron job. Is there more scheduling and cron controls within workflow?**

Because it's just TypeScript — if you're in a workflow, you can do something like `sleep('1 day')`, and that would resume in one day. But what you can also do — this is just a promise, or you can treat it as a promise — so you can do:

```ts
while (true) {
  sleep('1 day');
  // do your code
}
```

And it'll run once a day.

If you wanted to run once a day at 2 a.m., you could say — "how much time to 1 a.m. tomorrow?" — thank you, AI — and then done.

And you could also wake up every hour, do some checks whether you actually want to run the rest of the code. If not, go back to sleep. Anything you can do with code, you can do here.

And if you want concurrency controls or any kind of other deterministic controls — you have control flow in TypeScript here. You can check external APIs, for example, which you have to wrap in a step, but you can make fetch calls if you want to actually check data and then determine from there.

> **So if you wanted to do an agent that runs every once in a while — every day — you could have a scheduling wrapper, a scheduling workflow, that launches another agent workflow?**

Also, yeah. You can start workflows from workflows. Or you could do this — where you sleep a day and then call your agent. And then depending on — you might not want to write to the same stream. `getWritable` allows you to do namespaces, and you can get a new writable here. And then every time it runs you can have a new stream that has a deterministic name, and you can choose which stream to connect to.

---

> **Q: Is there cancellation logic? Like if I have something waiting for a long time and then I decide to not have that be a thing — how can I stop an existing sleep from waking?**

You can cancel your workflows from the observability UI, from the API, or from the CLI. All of those avenues have a cancel function.

Or you can also say — "well, I don't even know if I want to sleep until the end" — what you can do is:

```ts
await Promise.race([
  sleep('1 day'),
  humanApproval()  // wake up earlier if a human clicks a button
])
```

---

> **Q: If you have multiple agents running, what would be your advised way of having them communicate with each other?**

Depends on what kind of communication you're looking for. In steps, you have access to all Node.js APIs — fetch, etc. You can have a database, right? If you want to automate over your own data source, you can have a database. If you want to have multiple agents, you can use some of the same streams to write to and share a stream.

> **Follow-up: I guess it's up to us ultimately — our steps need to be idempotent, and if they have side effects when they fail halfway, that's well-behaved — that's not at your orchestration layer, that's up to us?**

For the workflow layer, we guarantee that there's no side effects because if you try to import some code that has side effects, it'll just say "can't compile."

> **That was true for workflows, but for steps?**

For steps, it can have side effects. That's sort of the point.

> **So it's up to us — like if it fails, we need to make sure it's transactional and rerunnable and idempotent?**

There's some error controls you can add here. If a step fails, it'll usually fail with an error that tells the workflow orchestration layer that you can retry it. You can also catch this error and say, "well, if it's this kind of error, don't retry it. Instead, signal to the human to do something or try this other avenue."

---

> **Q: Do you have one of the branches that has the complete code for what you just did?**

Yes. They all build on top of each other. So the `conf/5-hooks` branch has the human approval tool call, the sleep tool call, resumable streams, and using workflow.

> **I will see how I can post one with general access.**

Just tweet it out.

---

> **Q: The workflows are in beta?**

Yes. Workflow Development Kit is in beta. We have a GitHub — using it in production especially for durable agent stuff.

Internally we have, I think, more than 1 million workflows that have been run a day.

It's mostly just getting the API to be stable and a bunch of issues. But one of the things I love is that we actually have more feature requests than issues.

If there's any feature that you need or that you really want to see — we have an RFC section on GitHub discussions for upcoming features, things that we'll ship by GA or shortly afterwards. And then open issues, right, where you can add any issue and presumably we'll be able to fix it soon or someone from the community.

Again, all of the adapters that help Workflow Development Kit run on any kind of cloud backend or your homebrew backend — all of those adapters are also open source. So you can see exactly what's happening and you can connect it to your own backend. Just look at the source code and we'll be happy to help you.

---

> **Q: Can you talk about versioning?**

What would you like to know?

> **The roadmap for versioning.**

Right. So for versioning — I talked a little bit about the ability to upgrade runs across versions. Versioning is going to be very simple — we have a CRUD interface for all of the versions that you have created, which for most people will be a deployment. If you deploy your CI code to a preview environment or production, every deployment will be one version. And you can list those versions at any point using the workflow API. And the run will know which version it's running on, and you can call `run.upgrade` to see if it's compatible with a new version to upgrade it to that version.

Every deployment gets its own URL, and not just in Vercel — but presumably in your setup. If you go to AWS Lambda, for example, every deployment has its own URLs. So the webhooks would apply to its own URLs, which means that you don't need to worry about versioning except for tagging a version when you first create the deploy. And then whatever you think you want to be your main version is the one you route to via your public API.

> **Audience comment: I think a lot of people — unfortunately it's like isolation, but sometimes you want to sort of fix-in-place things that have been running a while.**

Yeah. Migrations — almost like agent migrations to new versions.

So this is the same as upgrading in that sense, right? But if you have a bunch of runs that are all on a certain version and you have shipped new code and you want all those runs to be upgraded to the new version — or migrated — in the UI you'll be able to select however many runs you want, or for the CLI you'll be able to get a list and then say "for these 20 IDs I want to upgrade the run to this version."

It'll do an internal check of "can I resume these workflows from a certain point?" — like, can I migrate them in place, because the step signatures overlap? Or if not, it'll offer you the option to cancel all of the existing runs and rerun them on a new version with the same input.

If you write your code in a way that's compatible, there's going to be different options for in-place migrations.

> **How would it detect that — just by code parts not being changed?**

Because we're essentially a compiler plugin, we can get full compatibility information. And we are saving the input and output signatures to a manifest that we're uploading for the versions. So for every version we can tell what are the signatures for every step and for the workflow itself and all the other things that are happening in between.

> **Another thing here is the workflow function itself. You replay it a whole bunch of times during execution anyway.**

Right. So when you want to upgrade, you run the event log against the new code.

> **Sure. There's a lot of variations — like "I did a step, all the previous steps stayed the same, or this one got changed." So if everything's done automatically, it feels like I could bring down all my agents immediately — or bring them up.**

There's two ways you could be versioning. The thing with [other platforms] is you build for a platform where you assume that your code is always going to evolve in the same place. So what we've seen is — you end up with, as you start your first version of your workflow that you ship, but as you start making updates, your code now has all this stuff in there and you have no guarantees of what version is running on the actual code that you're running.

The default assumption is that "my code could be running against any event log." And you end up with — starts great and then you have to do mental model management.

But it was the same with killing and resuming — you already had this forever. There's a natural step to go say "cool, we're just gonna assume that you push a new version of the workflow, you pin everything, so you don't have to worry about that mental model." Instead, it's a one-time action — push button, upgrade — or even choose exactly how much of that to apply. There's a lot of stuff you can do on top since you have all the information. But what's nice is that's a hard UX problem, and when done well, hopefully very useful.

---

> **Q: I think the other part is observability. I poked around and I don't see much of a dashboard. I expect that obviously you're going to build one, right? And then I also want to import it into my Datadog.**

OpenTelemetry spans — which we'll be able to emit. We'll add some context to the spans by default, presumably. So if you just pipe your spans through Datadog, it'll already have a lot of information on the steps and event log. And you can also submit your own telemetry obviously.

> **So is that the plan, or do you have first-party support?**

The plan is that we will first-party support adding all of the step and event-log related context. We'll presumably export a helper to add some of this information to the spans. And then whatever information you want to tag in there is up to you.

---

> **Q: Can I attach secrets to a workflow in a way that when I need to update them they kind of propagate?**

So — for one, right now you can inspect all of the input and output data, and it's obviously for you as someone with access to the API, which someone consuming the workflow or starting the workflow through a web API wouldn't usually have.

The workflows run in the same deployment as they usually would and have access to the `process` environment, right? So you can inject environment variables the way you would usually do. And as long as you don't log them — which again presumably you wouldn't do anyway — it's the same way as an API endpoint.

And then if you want your data to be secret — right now we expose it in observability if you have access. But we also will allow in the future end-to-end encryption for any data stored.

---

All right, then we'll close the session but we'll be around a little bit more for questions if you want.
