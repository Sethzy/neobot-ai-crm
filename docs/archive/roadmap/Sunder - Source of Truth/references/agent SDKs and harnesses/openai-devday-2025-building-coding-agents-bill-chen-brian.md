# Building Coding Agents — OpenAI DevDay 2025

> **Source:** OpenAI DevDay 2025 talk
> **Speakers:** Bill Chen & Brian, Applied AI Startups Team, OpenAI
> **Saved:** 2026-04-04
> **Tags:** codex, harness, agent SDK, coding agents, harness-as-abstraction

---

## Transcript

[music] Hello everyone. Um, today we'll be talking about how to build coding agents. And uh, I'm Bill. I work on the applied AI startups team at OpenAI. >> And I'm Brian. I work with Bill on the OpenAI startups team. >> And we specifically uh focus on uh building coding agents here at OpenAI. Um yeah.
So why are we talk giving this talk? Why why are we you know u talking about coding agents? Well, it's really quite interesting because it's been booming for the the the past year. Actually, it's just if you think about it, it's not that much time ago. like only have been a year or so. The ground keeps shifting really under the uh harness on on the coding agents.
But if you think about it, it's really like why it's interesting is because it's really a signal on how close we are to AGI. Software engineering can be set as a universal medium for problem solving. But because the ground is shifting so fast, uh we h kept having to rebuild the agent on top of the model whenever a model is released.
And today we're going to talk a little bit about how we might be able to get around that. So here's what we're going to go over today. We'll start with the anatomy of a coding agent, especially going into the details of models and harnesses and how they work together. We'll share some lessons that we learned from putting them together ourselves.
And we're specifically going to talk about codeex here, which is our own coding agent. We'll talk a little bit about emerging patterns that we're seeing from all of you for using agents like Codeex in your own products. And lastly, we'll talk a little bit about what to expect from Codeex in the future so that you can build along with us if you want to.
To start, let's talk a little bit about what makes a coding agent an agent as a whole. Um, it really is quite simple. I think you know people kind of over complicate things a little bit these days. It's made out of three parts. It's a user interface. It has a model. It's a harness, right? Uh the interface quite self-explanatory.
Could be a computer uh like a CLI tool or it could be a uh integrated developer environment, could be also cloud or background agent. Um models also very quite self-explanatory are you know the things like the latest and greatest the GPD 5.1 codeex uh max that we just released yesterday uh or the GPD 5.
1 series of models or other uh models from other providers as well. And the harness uh is a little bit more of an interesting part. This is the part that directly interacts with the model uh in the most reductive way. You can sort of think of it as a collection of prompts and tools combined in a core agent loop which provides input and outputs uh from a model.
Uh the last part will be our focus for today. As touched on a bit earlier, coding is one of the most active frontiers in applied AI and uh how models are constantly getting released and we're not making the problem uh easier for everybody is that people have to constantly adapt uh the agents to the new models. So, um, Bill's done a great job of giving us an overview of coding agents, what they're made up of.
So, let's zoom in a little bit on the harness. Um, it turns out that's a little bit tricky. So, what is a harness? A harness is really the interface layer to the model. It's the surface area the model uses to talk to users and the code and perform actions with tools. It's made up of all of the pieces that the model needs to work over many turns, call tools, and and really write code for you and interpret what the user is actually asking.
[snorts] Um, for some, the harness might actually be the special sauce of the product. But as we're going to go into a little bit more, it's really challenging work to build a good harness. And we'll talk about how we did that. So let's see what are some of these challenges. Um just to name a few, AV is one. Um your [laughter] um your brand new innovative custom tool that you're giving to your agent might not actually be something the model is using is used to using.
It may not have ever seen that tool before in trading. And even if it is, you need to spend time tuning your prompt to that particular model and the habits that it comes with. And new models are coming out all the time. What about latency? Like does the model take a while to think about certain things? Which things do you prompt it not to? How do you expose the UX of what a thinking model is doing while it's thinking? Is it communicating with you while it's thinking or do you have to summarize it? Managing the context window and compaction can be
really challenging. We just launched Codeex Max that does that out of the box for you. you don't have to worry about compaction and context window management. It's really hard to do. Um, and so if you were to do it yourself, have fun. Um, and then also like the APIs keep changing, right? So we have completions, we have responses, we have whatever else is coming in the future.
What does the model know how to use and get to get the most intelligence out of the box? And so this is the interesting part. Fitting a model into a harness takes a lot of prompting. It turns out that how the model is trained has side effects. I like to think about it this way. Intelligence plus habit. Intelligence.
What is the model good at? What languages does it know really well? What is what is its capabilities in terms of like how well it can write code in certain frameworks? And then what habits did it learn to to use to solve those problems? We've trained our models to have habits of like planning a solution, looking around, gathering context, and and thinking about a problem before diving in and writing code, and then testing its work at the end.
Developing a feel for these habits is how you become a good prompt engineer. If you don't instruct the model in ways that it's familiar with, you can have problems. We saw this when we launched GPD5. A lot of people who weren't used to using our models encoding tried to take prompts that existed for other models and put them into their harness and have GPD5 follow those instructions.
And it turned out that we taught our model to do some of the things that the other models didn't really do out of the box. And so when they were prompting them to look really hard at the context and like examine every single file before making a a code edit, our model was being very kind of thorough about that and it was taking a really long time and they weren't seeing the best performance.
And so we figured out that if you let the model just do the behaviors that it's used to and don't overprompt it, it'll actually perform really better. We found out by asking. I was literally like, "Hey, like I like the solution, but it took you a long time to get there. What can I do differently in your instructions to help you get there faster next time?" And literally it said, "Uh, you're telling me to go look at everything and I don't really need to.
So that's what's taking forever." And so you can actually see the advantages of building both the model and the harness together because you just like know all of that while you're building it. And that's why Codex is both a model and a harness combined. So let's dig deeper into Codeex and what it can actually do. So we built Codex to be an agent for everywhere that you code.
It's a VS Code plugin. It's a CLI. You can call it in the cloud from the VS Code plugin or from chatgbt from your phone. Um, and it's very basic. You can use it to turn your specs into runnable code starting from a prompt. Um, having a plan. It navigates your repo to edit files. It runs commands, executes tasks, and you can call it from Slack or you can have it review PRs and GitHub.
So, all of the things that you would expect. And that means that the that codec um the harness of codec needs to be able to do a lot of really complex things. Uh when I talked to a member of the codeex team about this slide and what should be on it, he was like it's way harder than you think. You have to manage parallel tool calls like thread merging and all of the things involved in that.
Think about all the security considerations you have with sandboxing, prompt forwarding, permissions, uh, port management. Um, compaction is a whole thing. Um, and doing that well is really complex. When do you trigger compaction? When do you reinject? How do you worry about uh cache optimization during that MCP, right? Like all of the uh plumbing you have to build for MCP support into the harness.
Uh, and then not even mentioning images and what's the resolution that you need to compress them to to send them to the model. All this all of this is like work that you have to do if you're going to build this from scratch and keep it updated as new features come online. So since we've bundled all of these features together for you in an agent that can safely write its own tools to solve new problems that it encounters.
Oops. Uh we actually have here uh a computer use agent for the terminal. Wow, that sounds quite a bit powerful than just plain old coding agent, doesn't it? Um but just think about it again. Well, before browser and graphic user interface was a thing, wasn't that how we always operate a computer? they're writing code and chain them together in a command line interface.
So that means if you can express your tasks in command line as well as files tasks codeex will be able to know what to do. Um the example is I like to use codeex to organize a lot of the photos from my desktop into a folder and that's a very simple use case but what it can also do is it can analyze huge amounts of CSV files inside of a folder uh doing data analysis it does not have to be a coding task and if it can be accomplished by running tools from command line you can use codeex so now that we see codeex is such a cool
harness um I want to also share a little a bit about how you can use it to build your own agents. And what you can do is you can use codeex [clears throat] the agent inside of your own agent. Um, how does that work? Well, if you want to build uh a coding uh the next coding startup, we don't really have all the answers, but we do have a few patterns uh that we thought uh might help you having worked with some of the top coding customers uh like cursor and VS code.
Uh one of those patterns is uh harness becoming the new abstraction layer. The benefits of this is quite obvious. Um, you no longer have to care about prioritize optimizing the prompt and tools with every model upgrade. [snorts] >> But, um, does that mean you're just building a wrapper? >> Well, I disagree with that take. I disagree.
I was disagreeing with my colleague here. Um, just like how building rappers on top of models I think is really reductive on uh on the whole value prop of the infrastructure layer. Sorry, I used to be a VC. [laughter] >> Focusing most of your efforts on differentiating your product is what this pattern allows you to do. And that's where most of the value lies.
Exactly. Okay. So, let's look at some of these patterns that we've seen and actually have helped our customers build um along with them. Codeex is an SDK. It can be called through a TypeScript library. You can call it programmatically and a Python exec. There's a GitHub action that you can plug into to have it merge merge conflicts on PRs that everybody hates doing.
Then uh you can also add it to the agents SDK and give it MCP connectors back to your product. So now you have an agent. I like to say we started with chat bots that you can talk to. Then we gave the chatbots tools to use. And then now you can give uh a tool to your chatbot that can make other tools that it doesn't have. And so now you can actually build out enterprise software that does it that writes its own plug-in connectors to the API level for each customer on the spot.
That's something that a professional services team used to have to do. Um, so you have fully customizable software that can now talk back to itself. Um, I made a conbon board for dev day that can actually fix its own bugs. Um, it's pretty fun. And then lastly, um, you can actually do something like what Zed has done.
They have just decided to wrap codeex inside of a layer and give it an interface to the IDE for talking back and forth for the user and making code edits. And now they don't actually have to do all the work of staying on top of all of the things that we're good at doing and they can focus on building like the best code editor.
Uh so our top coding partners like GitHub has used this uh to great effect and well uh we've created an SDK uh for it that they used to directly integrate uh with codeex. You can also use the SDK to uh control codecs as part of your CI/CD pipeline as well as use it as an agent that directly interacts with your own agent as well.
Uh [clears throat] if you really want to customize the agent layer, you can do it too. As an example of this, we worked with closely with the cursor team to get the best performance out of the codecs. The model, not the agent, we're bad at naming things. The model is different from the agent. They did so by aligning their tools to be in distribution with how the model is trained and they did so by aligning uh their harness with our open- source uh implementation of codeex CLI.
All of this is publicly available. Uh you can fork the repo, you can use our source code, you can use it. Uh go nuts. So what does the future hold for Codeex? It hasn't even been out for a year. Um and especially with the lo la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la launch of CEX match yesterday like things are really changing fast.
Uh it's the fastest growing model in usage now serving dozens of trillions of tokens per week which has actually doubled since dev day. It's always good to build where the models are going. It's safe to assume that the models will get better. They'll be able to get to work on much longer horizon tasks unsupervised. New models will raise the trust ceiling.
I trust these models now to do some way harder work than I would have 6 months ago. And that's going to keep increasing. The future is about sprawling code bases and non-standard libraries and knowing how to work in closed source environments, matching existing templates and practices and the models uh and and and so you can imagine that the SDK will evolve to better support these model capabilities, letting the model learn as it goes and not repeat mistakes and generally provide more surface area for an agent
that writes code and uses a terminal to solve whatever problems it encounters. counters and you can use that in your products via the SDK. So, what have we learned? Harnesses are really complicated and take a lot of work to maintain, especially with all the new models coming out. So, we've built one for you inside of Codeex that you can use off the shelf or look at the source if you want to and you can use it to build new things outside of coding and let us do all of the work making sure that you have the most capable
computer agent. And we're really excited to see what you craft. [applause] Heat. Heat. [music]

---

## Summary: The "Harness as Building Block" Shift

The core idea is a change in abstraction level for how you build AI-powered products.

**Old pattern (direct model calls):**
```
Your App -> API call to GPT/Claude -> parse response -> manage tools, context, compaction, retries yourself
```

You're responsible for the entire harness: prompt engineering per model, tool orchestration, context window management, compaction, parallel tool calls, sandboxing, error recovery. Every new model release means re-tuning all of that.

**New pattern (harness as building block):**
```
Your App -> Codex SDK / Claude Agent SDK -> harness handles everything -> results back to your app
```

You call the *agent CLI/SDK* as your primitive, not the raw model. The harness — built and maintained by the lab that trained the model — handles all the gnarly internals: prompt tuning, tool calling conventions, context compaction, thinking behavior, etc.

**Why this works better:**

1. **The lab knows the model's habits.** Bill's anecdote is telling — they literally asked GPT-5 why it was slow and it said "you're telling me to look at everything and I don't really need to." The team that trains the model understands its behaviors in a way external harness builders can't match. Prompts that work for Claude don't transfer to GPT and vice versa.

2. **Maintenance cost shifts to the lab.** When a new model drops, the lab updates the harness. You don't have to re-engineer your prompt/tool layer. Bill explicitly calls this out: "you no longer have to prioritize optimizing the prompt and tools with every model upgrade."

3. **You focus on differentiation.** Instead of spending engineering cycles on context compaction algorithms and tool-call thread merging, you spend them on what makes your product unique — the UI, the workflow, the domain-specific logic.

**Concrete examples from the talk:**

- **Zed** (code editor) wraps Codex inside their IDE. They don't build their own coding agent harness — they focus on being the best editor and let OpenAI handle the agent internals.
- **Cursor** aligned their tools to match how the Codex *model* was trained, using the open-source Codex CLI as reference. They customize the surface, not the engine.
- **GitHub Copilot** integrated via the Codex SDK directly.

**The "wrapper" objection:** Brian pushes back on this. It's not a thin wrapper — it's a *strategic abstraction*. Just like nobody calls building on top of Postgres "just a wrapper." The harness handles a genuinely hard infrastructure problem (Bill's teammate said "it's way harder than you think"), and outsourcing that lets you compound effort on the product layer.

**Key harness challenges Bill enumerates:**
- Tool alignment (model may never have seen your custom tool in training)
- Prompt tuning per model (habits differ between model families)
- Latency management and thinking UX
- Context window management and compaction
- API surface changes (completions -> responses -> future)
- Parallel tool calls and thread merging
- Sandboxing, permissions, security
- MCP plumbing
- Image resolution handling

**The "intelligence + habit" framework:** Models have both raw capability (intelligence) and learned behaviors (habits). Fitting a model into a harness means understanding its habits — planning before coding, gathering context, testing afterward. Over-prompting against these habits (e.g., telling GPT-5 to exhaustively examine every file when it already knows to be selective) degrades performance. The lab that trained the model has the deepest understanding of these habits.

**Future direction:** Models will handle longer-horizon tasks unsupervised. Trust ceiling keeps rising. The SDK will evolve to give the agent more surface area — learning as it goes, not repeating mistakes, working in closed-source environments with non-standard libraries. You build on top of this via the SDK.
