# The Harness Is a Framework

**Author:** Joel Hooks (JoelClaw)
**Source:** joelclaw.com
**Date:** March 2, 2026

---

Dan Farrelly wrote a piece called "Your Agent Needs a Harness, Not a Framework" and I think he's almost right. The infrastructure argument about durability, retries, event routing, and state persistence is dead on. Every agent framework is rebuilding that stuff badly from scratch. Inngest already solved it. Use the solved thing.

But I want to push back on one word: "not."

## The Word Got Poisoned

"Framework" became a dirty word in AI because when people think AI framework, they think LangChain, and LangChain left a trail of questionable decisions and wonky apps.

A lot of people got burned and generalized that pain to the whole category. The issue was not frameworks as a concept. The issue was one early example that shaped first impressions.

When Dan says "harness," he's describing something with extension hooks, a plugin system, lifecycle events, session management, and a prompt composition pipeline. That's a framework. It's just a good one that doesn't fight you.

## The Shape of the Claw

I've been building joelclaw for a while now. It started as an experiment and turned into something that supports a lot of my day-to-day work, an always-on system that handles messages, processes events, manages memory, and coordinates work across a dozen surfaces.

Pi is just the right amount of structure. It carries opinions and sensible defaults, but gives you vast freedom to build your own shape on top. It's substrate, not scaffolding. The difference matters. Scaffolding comes down. Substrate is what you grow in.

The framework layer is pi. Here's what it actually gives me:

- **Session management:** append-only JSONL with tree structure, branching, compaction
- **Extension API:** lifecycle hooks at every stage (session_start, turn_start, tool_call, etc.)
- **Skill loading:** taxonomy-aware injection of domain knowledge into prompts
- **Tool registration:** custom tools with TypeBox schemas and execute functions
- **Prompt composition:** multi-stage pipeline that assembles system prompts from identity, role, context

I've extended pi with custom tools. I've built a gateway on top of it. I've layered memory and observation pipelines through its extension system. Every time I need something new, there's a hook for it.

That's not a harness. That's a framework. A really good one that stays out of your way until you need it, then gives you exactly the right surface.

## The Rails Test

You know something is a framework when removing it means rebuilding half of it yourself. If I ripped pi out of joelclaw tomorrow, I'd spend weeks recreating session persistence, extension loading, skill injection, and prompt composition. That's the Rails test: you can hate Rails, but if you leave it, you end up rebuilding the parts of Rails you actually needed.

The same people who say "use a harness, not a framework" will turn around and build a harness with a config file, a plugin system, and an event bus. Congratulations, you built a framework and called it something else because one early ecosystem experience poisoned the word.

## The Real Distinction

The useful distinction isn't harness vs framework. It's between frameworks that own your execution model and frameworks that provide scaffolding for yours.

**LangChain owns your execution model.** It decides how chains work, how tools get called, how memory flows. Fight it and you lose.

**Pi provides scaffolding.** It gives me hooks, not opinions about what those hooks should do. My gateway daemon is a pi session, but pi doesn't know or care that it's a gateway. It just provides the session substrate and the extension points. I do the rest.

This is the same pattern as every good framework in history. Next.js doesn't care if you're building a blog or a SaaS. Express doesn't care if you're building an API or a webhook handler. The framework provides the scaffolding. You provide the shape.

A really good tool isn't a unitasker, but it's also not an everytasker. This is a design problem. "Don't Make Me Think." "The Design of Everyday Things." Good tools, good frameworks, don't happen by accident. They happen because someone thought hard about where to have opinions and where to shut up. The test isn't whether a tool calls itself a framework or a harness. The test is whether it has opinions about your problem or opinions about its problem.

## Infrastructure Is Orthogonal

Dan's strongest point, and the one I'm fully aligned on, is that durability is a solved problem. Every agent needs retries, state persistence, concurrency control, and event routing. Those aren't agent problems. They're distributed systems problems. Inngest solved them.

joelclaw runs 110+ durable functions through Inngest. Every step is memoized. Every failure retries. Every event is routed. I didn't build any of that. I just used the solved thing. You can self-host it on your own hardware and own the whole stack.

The mistake is conflating "I need infrastructure" with "I don't need a framework." You need both. The framework handles the agent surface: sessions, tools, prompts, extensions. The infrastructure handles the durability surface: events, steps, retries, state. They're different layers solving different problems.

## Three Layers, Not Two

joelclaw is three layers:

| Layer | What | Provides |
|-------|------|----------|
| Framework | Pi | Sessions, extensions, skills, tools, prompt composition |
| Infrastructure | Inngest + Redis + k8s | Durability, events, state, retries, scheduling |
| Composition root | The glue I wrote | Gateway, CLI, system-bus worker, memory |

The composition root is the thin part. It wires the framework to the infrastructure with my specific opinions about how messages flow, how skills get loaded, and how the system responds to events. That's the part that's truly mine. Everything else is standing on the shoulders of people who solved hard problems so I don't have to.

Dan's right that most people are trying to cram all three layers into one tool. That's the actual problem. Not frameworks. Not harnesses. Just bad layering.

We're not disagreeing. This is a "yes, and": Dan's article lays out exactly the right infrastructure thinking. I'm just saying don't be afraid of the word "framework" because one bad experience burned you. The harness is a framework. That's not a criticism. That's a compliment.
