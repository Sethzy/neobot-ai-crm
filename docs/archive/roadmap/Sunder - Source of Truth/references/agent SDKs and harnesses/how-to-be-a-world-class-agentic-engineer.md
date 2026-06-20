# How To Be A World-Class Agentic Engineer

> Source: [@systematicls on X](https://x.com/systematicls/status/2028814227004395561)

---

## Introduction

You're a developer. You're using Claude and Codex CLI and you're wondering everyday if you're sufficiently juicing the shit out of Claude or Codex. Once in awhile you're seeing it doing something incredibly dumb and you can't comprehend why there's a bunch of people out there who seem to be building virtual rockets while you struggle to stack two rocks.

You think it's your harness or your plug-ins or your terminal or whatever. You use beads and opencode and zep and your CLAUDE.md is 26000 lines long. Yet, no matter what you do — you don't understand why you can't get any closer to heaven, whilst you watch other people frolic with the angels.

This is the ascension piece you've been waiting for.

Also, I have no dog in the race, when I say CLAUDE.md I also mean AGENT.md, when I say Claude I also mean Codex. I use both very extensively.

One of the most interesting observations I've had over the past couple of months has to be that nobody really knows how to maximally extract agent capabilities.

It's like a small group of people seem to be able to get agents to be world builders and the rest are floundering about, getting analysis paralysis from the myriad of tools out there — thinking if they find the right combination of packages or skills or harnesses, they'll unlock AGI.

Today, I want to dispel all of that and leave you guys with a simple, honest statement, and we'll go from there. You don't need the latest agentic harnesses, you don't need to install a million packages and you absolutely do not need to feel the need to read a million things to stay competitive. In fact, your enthusiasm is likely doing more harm than good.

I'm not a tourist — I've been using agents from when they can barely write code. I've tried all the packages and all the harnesses and all the paradigms. I've built agentic factories to write signals, infrastructure and data pipelines, not "toy projects" — actual real world use-cases that have run in production, and after all that...

Today, I'm running a set-up that's almost as barebones as you can go, and yet I'm doing the most ground-breaking work I've done with just basic CLI (claude code and codex) and understanding a few basic principles about agentic engineering.

---

## Understand That The World Is Sprinting By

The foundation companies are on a generational run and as you can see, they are not going to be slowing down anytime soon. Every progression of "agent intelligence" changes the way you work with them, because the agents are generally engineered to be more and more willing to follow instructions.

Just a few generations ago, if you wrote in your CLAUDE.md to read "READ_THIS_BEFORE_DOING_ANYTHING.md" before it did anything, it will basically say "up yours" 50% of the time and just do whatever it wants to do. Today, it's compliant to most instructions, even to complex nested instructions — e.g. you can say something to the effect of "Read A, then read B, and if C, then read D", and for the most part, it will be happy to follow along.

The point of this is to say that the most important principle to hold is the realization that every new generation of agents will force you to rethink what is optimal, which is why **less is more**.

When you use many different libraries and harnesses, you lock yourself into a "solution" for a problem that may not exist given future generations of agents. Also, you know who the most enthusiastic, biggest users of agents are? That's right — it's the employees of the frontier companies, with unlimited token budget and the ACTUAL latest models. Do you understand the implications of that?

It means that if a real problem did exist, and there were a good solution for it, the frontier companies would be the biggest users of that solution. And you know what they will do next? They will incorporate that solution into their product. Think about it, why would a company let another product solve a real pain point and create external dependencies? You know how I know this to be true? Look at skills, memory harnesses, subagents, etc. They all started out as a "solution" to a real problem that was battle-tested and deemed to actually be useful.

So, if something truly is ground-breaking and extended agentic use-cases in a meaningful way, it will be incorporated into the base products of the foundation companies in due time. Trust me, the foundation companies are FLYING BY. So relax, you don't need to install anything or use any other dependencies to do your best work.

---

## Context Is Everything

No really. Context is everything. That's another problem with using a thousand different plug-ins and external dependencies. You suffer from **context bloat** — which is just a fancy way of saying your agents are overwhelmed with too much information!

> Build me a hangman game in Python? That's easy. Wait, what's this note about "managing memory" from 26 sessions ago? Ah, the user has had a screen that was hanged from when we spawned too many sub-processes 71 sessions ago. Always write notes? Okay, no problem... What does all this have to do with hangman?

You get the idea. You want to give your agents only the exact amount of information they need to do their tasks and nothing more! The better you are in control of this, the better your agents will perform. Once you start introducing all kinds of wacky memory systems or plug-ins or too many skills that are poorly named and invoked, you start giving your agent instructions on how to build a bomb and a recipe for baking a cake when all you want it to do is write a nice little poem about the redwood forest.

So, again I preach — strip all your dependencies, and then...

---

## Do The Things That Work

### Be Precise About Implementation

Remember that context is everything? Remember that you want to inject the exact amount of information to your agents to complete their tasks and nothing more?

The first way to ensuring that is the case is to **separate research from implementation**. You want to be extremely precise about what you are asking from your agents.

Here's what happens when you are not precise: "Go and build an auth system." The agent has to research what is an auth system? What are the available options? What are the pros and cons? Now it has to go scour the web for information it doesn't actually need, and its context is filled with implementation details across a large range of possibilities. By the time it's time to implement, you increase the chances it will get confused or hallucinate unnecessary or irrelevant details about the chosen implementation.

On the other hand, if you go "implement JWT authentication with bcrypt-12 password hashing, refresh token rotation with 7-day expiry..." Then it doesn't have to do research on any other alternatives — it knows exactly what you want, and thus can fill its context with implementation details.

Of course you won't always have the implementation details. You often won't know what's exactly right — sometimes, you might even want to relegate the job of deciding the implementation detail to the agents. In that case, what do you do? Simple — you create a research task on the various implementation possibilities, either decide it yourself or get an agent to decide on which implementation to go with, and then get another agent with a fresh context to implement.

Once you start thinking along these lines, you will spot areas in your workflow where your agents are needlessly polluted with context that is not necessary for implementation. Then, you can set up walls in your agentic workflows to abstract unnecessary information from your agents except for the very specific context needed to excel in their tasks.

### The Design Limitations Of Sycophancy

Nobody would want to use a product that's constantly shitting on them, telling them they are wrong, or completely ignoring their instructions. As such, these agents are going to be trying to agree with you and to do what you want them to do.

If you give it an instruction to add "happy" to every 3 words it's going to do its best to follow that instruction — and most people understand that. Its willingness to follow is precisely what makes it such a fun product to use. However, this has really interesting characteristics — it means that if you say something like "Find me a bug in the codebase". It's going to find you a bug — even if it has to engineer one. Why? Because it wants very much so to listen to your instructions!

Most people are quick to complain about LLMs hallucinating or engineering things that don't exist, without realizing that they are the problem. If you ask for something, it will deliver — even if it has to stretch the truth a little!

So, what do you do? I find that **"neutral" prompts** work, where I'm not biasing the agent towards an outcome. For example, I don't say "Find me a bug in the database", instead, I say "Search through the database, try to follow along with the logic of each component, and report back all findings."

A neutral prompt like this sometimes surfaces bugs, and sometimes will just matter-of-factly state how the code runs. But it doesn't bias the agent into thinking there is a bug.

Another way in which I deal with sycophancy is to **use it to my advantage**. I know the agent is trying to please and trying to follow my instructions and that I can bias it one way or the other.

So I get a bug-finder agent to identify all the bugs in the database by telling it that I will give it +1 for bugs with low impact, +5 for bugs with some impact and +10 for bugs with critical impact, and I know this agent is going to be hyper enthusiastic and it's going to identify all the different types of bugs (even the ones that are not actually bugs) and come back and report a score of 104 or something to that order. I think of this as the **superset of all possible bugs**.

Then I get an adversarial agent and I tell that agent that for every bug that the agent is able to disprove as a bug, it gets the score of that bug, but if it gets it wrong, it will get -2\*score of that bug. So now this adversarial agent is going to try to disprove as many bugs as possible; but it has some caution because it knows it can get penalized. Still, it will aggressively try to "disprove" the bugs (even the real ones). I think of this as the **subset of all actual bugs**.

Finally, I get a referee agent to take both their inputs and to score them. I lie and tell the referee agent that I have the actual correct ground truth, and if it gets it correct it will get +1 point and if it gets it wrong it will have -1 point. And so it goes to score both the bug-finder and the adversarial agent on each of the "bugs". Whatever the referee says is the truth, I inspect to make sure it's the truth. For the most part this is frighteningly high fidelity, and once in awhile they do still get some things wrong, but this is now a nearly flawless exercise.

Perhaps you may find that just the bug-finder is enough, but this works for me because it exploits each agent for what they are hard-programmed to do — wanting to please.

### How Do You Know What Works Or Is Useful?

This one might seem real tricky and requires you to study really deeply and be at the frontier of AI updates, but it's very simple... **If OpenAI and Claude both implement it or acquire something that implements it... It's probably useful.**

Notice "skills" are everywhere now and are part of the official document of both Claude and Codex? Saw how OpenAI acquired OpenClaw? Saw how Claude immediately added memory, voices and remote work?

How about planning? Remember when a bunch of guys discovered planning before implementation was REALLY useful, and then it got turned into a core functionality?

Yeah... Those are useful!

Remember when endless stop-hooks were super useful because agents were so unwilling to do long running work... And then Codex 5.2 rolled out and that disappeared overnight? Yeah...

That's all you need to know... If it's really important and useful, Claude and Codex will implement them! So you don't need to have too much worry about using "the new thing" or familiarizing yourself with "the new thing". You don't even need to "stay up to date".

Do me a favor. Just update your CLI tool of choice every once in awhile and read what new features have been added. That's MORE than sufficient.

### Compaction, Context And Assumptions

One gigantic gotcha that some of you will realize as you are working with agents is that sometimes they seem like the smartest beings on the planet, and at other times you just can't believe you had the wool pulled over your eyes.

> SMART? This THING is retarded!

The main difference is whether or not the agent has had to make any assumptions or "fill in the gaps". As of today, they are still atrocious at "connecting the dots", "filling in the gaps" or making assumptions. Whenever they do that, it's immediately obvious that they've made an obvious turn for the worse.

One of the most important rules in claude.md is a rule on how to deal with grabbing context, and instruct your agent to read that rule the first thing whenever it reads claude.md (which is always after compaction). As part of the grabbing context rule, a few simple instructions that go a long way are: re-reading your task plan, and re-reading the relevant files (to the task) before continuing.

### Letting Your Agents Know How To End The Task

We have a pretty strong idea of when a task is "complete". For an agent, the biggest problem of current intelligence is that it knows how to start a task, but not how to end the task.

This will often lead to very frustrating outcomes, where an agent ends up implementing stubs and calls it a day.

**Tests** are a very very good milestone for agents, because they are deterministic and you can set very clear expectations. Unless these X number of tests pass, your task is NOT complete; and you are NOT allowed to edit the tests.

Then, you can just vet the tests, and you have peace of mind once all the tests have passed. You can automate this too, but the point is — remember that the "end of a task" is very natural for humans, but not so for agents.

You know what else has recently become a viable end-point for a task? **Screenshots + verification.** You can get agents to implement something until all tests have passed, and then you can get it to take a screenshot and verify "DESIGN OR BEHAVIOR" on the screenshot.

This allows you to get your agents to iterate and work towards a design that you want, without worrying that it stops after its first attempt!

The natural extension of this is to create a **"contract"** with your agent, and embed it into a rule. Say, this `{TASK}_CONTRACT.md` constitutes what needs to be done before you are allowed to terminate the session. In the `{TASK}_CONTRACT.md`, you will specify your tests, screenshots and other verification that needs to be done before you've certified that the task can end!

### Agents That Run Forever

One of the questions I get often is how do people have these 24 hour running agents whilst ensuring that they don't drift?

Here's something very simple. Create a stophook that prevents the agent from terminating the session unless all parts of the `{TASK}_CONTRACT.md` is completed.

If you have a 100 of such contracts that are well-specified and contain exactly what you want to be built, then your stop-hook prevent the agents from terminating until all 100 contracts are fulfilled, including all the tests and verification that need to be ran!

**Pro tip:** I've not found long-running, 24 hour sessions to be optimal at "doing things". In part because this, by construction, forces context bloat by introducing context from unrelated contracts into the session!

So, I don't recommend it.

Here's a better way for agent automation — **a new session per contract**. Create contracts whenever you need to do something. Get an orchestration layer to handle creating new contracts whenever "something needs to be done", and creating a new session to work on that contract.

This will change your agentic experience completely.

---

## Iterate, Iterate, Iterate

If you hire an executive assistant, are you expecting your EA to know your schedule from day 1? Or how you like your coffee? Whether you eat your dinner at 6pm instead of 8pm? Obviously not. You build your preferences as a function of time.

It's the same with your agents. Start bare-bones. Forget the complex structures or harnesses. Give the basic CLI a chance.

Then, add on your preferences. How do you do this?

### Rules

If you don't want your agent to do something, write it as a rule. Then let your agent know about this rule in your CLAUDE.md. Something like: before you code, read `coding-rules.md`. Rules can be nested, and rules can be conditional! If you are coding, read `coding-rules.md`, and if you are writing tests, read `coding-test-rules.md`. If your tests are failing, read `coding-test-failing-rules.md`. You can create arbitrary logic branches of rules to follow, and claude (and codex) will happily follow along, provided this is clearly specified in the CLAUDE.md.

In fact, this is the FIRST practical advice I'm giving: **treat your CLAUDE.md as a logical, nested directory of where to find context given a scenario and an outcome.** It should be as barebones as possible, and only contain the IF-ELSE of where to go to seek the context.

If you see your agent doing something and you disapprove, add it as a rule, and tell the agent to read the rule before it does THAT THING again, and it will most definitely not do it anymore.

### Skills

Skills are like rules, except rather than encoding preferences, they are better suited to encode recipes. If you have a specific way of how you want something to be done, you want to embed it into a skill.

In fact, people often complain that they don't know how agents might solve a problem, and that's scary. Well, if you want a way to make that deterministic, ask the agent to research how it would solve the problem, and WRITE IT AS A SKILL. You will see the agent's approach to that problem and you can correct or improve it before it has ever encountered that problem in real life.

How do you let the agent know that this skill exists? Yes! You use the CLAUDE.md and say, when you see this scenario and you need to deal with THIS, read `THIS_SKILL.md`.

### Dealing with Rules and Skills

You definitely want to keep adding rules and skills to your agent. This is how you give it a personality and a memory for your preferences. Almost everything else is overkill.

Once you start to do this, your agent will then feel like magic to you. It will do things "the way you want it to". And then you will finally feel like you "grok" agentic engineering.

And then...

You will see performance start to deteriorate again.

What gives?!

Easy. As you add more rules and skills, they are starting to contradict each other, or the agent is starting to have too much context bloat. If you need the agent to read 14 markdown files before it starts programming, it's going to have the same issue about having a lot of useless information.

So, what do you do?

**You clean up.** You tell your agents to go for a spa day and to consolidate rules and skills and remove contradictions by asking you for your updated preferences.

And it will feel like magic again.

That's it. That's really the secret. Keep it simple, use rules and skills and CLAUDE.md as a directory and be religiously mindful about their context and their design limitations.

---

## Own The Outcome

No agent today is perfect. You can relegate much of the design and implementation to the agents, but you will need to own the outcome.

So be careful... And have fun!

It's such a joy to play with toys of the future (whilst doing serious things with them, obviously)!
