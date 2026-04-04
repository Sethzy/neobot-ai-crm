# Vercel Workflow Development Kit — Keynote Announcement

**Speaker:** Renee (Workflow Team Lead, Vercel) + Shabbum (Engineer, Mandolin)
**Event:** Vercel Ship (2026)
**Topic:** Introducing the Workflow Development Kit — durable, observable, serverless workflow orchestration

---

## Summary

Renee, who leads Vercel's workflow team, introduces the **Workflow Development Kit** (`npmi workflow`) — a new open-source library for writing durable, observable workflows as simple async/await TypeScript functions. The core insight: developers always think in workflow diagrams (step A → step B → step C), but the actual code ends up fragmented across dozens of API routes, queues, databases, and retry logic. The Workflow Dev Kit closes this gap with three primitives:

1. **Steps** (`use step`) — each step runs in its own serverless function with automatic retrying, caching of inputs/outputs, and built-in observability. Steps are compiled into separate API routes automatically.
2. **Webhooks** — create unique URLs that suspend the workflow until an external event (human approval, Stripe callback, GPU inference result) hits the URL. The workflow rehydrates with full state when the webhook fires. Modeled as promises, so `Promise.all()` / `Promise.race()` patterns work naturally.
3. **Sleep** — suspend the workflow for arbitrary durations (minutes, weeks, months) consuming zero resources. Implemented as a retriable error under the hood.

Because steps, webhooks, and sleep are all just promises, any pattern expressible with JavaScript promises maps directly to workflow orchestration: parallel fan-out, race conditions, timeouts, etc.

Shabbum from **Mandolin** (healthcare AI agent platform processing $10B+ in drugs/year) then demos a real production use case — a prior authorization agent that uses multi-agent loops (research agent, recorder agent, QA agent, reasoner agent) orchestrated as a workflow with human-in-the-loop review via webhooks.

Key facts:
- Ships today with Next.js, Nitro, and Hono support. More frameworks coming.
- Runs entirely locally in dev (file system queues/storage). Deploys to Vercel with serverless functions + Vercel Queues.
- Open source — community can build custom "worlds" (adapters) for any cloud/database backend. Postgres adapter already exists.
- Vercel runs ~1 million workflows/day internally (v0, Vercel Agent, Mandolin).
- Free observability via CLI: `npx workflow web` opens a trace viewer showing inputs/outputs of every step, retries, and sleeps.

---

## Transcript

**Renee:**

Hey, hey, thanks so much for being here. I'm Renee. I lead the workflow team at Vercel and it's about — actually just hit about four months here at Vercel, but this isn't my first time at Vercel. This is a photo of the last time I was here, which was seven years ago. I was actually the first intern at Vercel in 2018 and that was my last day of my internship giving a talk when we launched Now 2.0.

It was basically running Docker in the cloud and that's Tim out there in the corner from the Next.js team. I ended up leaving after my internship and started my own startup and joined YC to do that. So I spent the next five years building a whole bunch of things in between. It started out with a coding agent but this is 2018, so no LLMs — it was hand-rolled static code analysis trying to do whatever we could with intelligent code analysis effectively.

We actually pivoted that startup into something else. We started working on data analytics and a video generation tool. So I won't go too much into my own story, but the common thread between everything we were building for five years in between always sort of started out as this diagram that I would throw out on a whiteboard and we would sketch on — kind of like a standard engineering diagram of how you draw all the different pieces of your workflow.

So, you know, for example, this is pretty much a good representation of what Windsor ended up being. It was a workflow of different steps that you have as someone requests a video and then you send a video out with this whole video generation pipeline in between, right? So, you would get a request, generate an audio file, do some ffmpeg processing.

We also had this one GPU inference step which always made it annoying because we wanted to keep everything on Vercel and have everything serverless but when you have something like GPUs and Vercel just didn't have that for a long time, we had to go and sort of have this extra step and then orchestrate everything in between various functions, right? And so you end up kind of having to handle your own workflow orchestration — you have these queues in between that you wire everything up with for resiliency.

And this is pretty much our actual stack. We had this hand-rolled internal tool to let you sort of human-review and watch every single video that was generated and three different databases we had to set up. A lot of the state doesn't even matter to the user. It's just for our own internal admin tool and also wiring up your own observability — stuff like Sentry, but we also sort of hand-rolled stuff before that.

And it ends up being a lot of code to maintain. And I love this slide because I asked ChatGPT to try and just generate a lot of code to explain what was going on. And I actually wish it was this simple. It would have been great if all of Windsor was a single file, but it ends up being, you know, a lot more than that.

You've got a whole bunch of API routes. That diagram that I have — there isn't one place I can just go read that, right? You end up having something that every time you onboard a new engineer, I have to go whiteboard and explain the same thing to them over and over again. Your code just isn't readable.

So, okay, I'm going to come back to this example, but I want to quickly switch to something else that we built at the workflow team pretty recently.

This was something that Nate from the team started sketching out. I love this because this is an actual screenshot from Excalidraw as opposed to the marketing-team-created better Vercel-themed workflow you saw. I'll walk you through what this is. It's a little Slack bot that exists in the Vercel Slack right now.

You can go into any channel and start "Story Time" and it will generate a new story. So it'll prompt you with the new story and anybody on Slack can respond to the story and help build a collaborative story together within a Slack thread. So basically an AI agent but in a Slack thread, right? A different way to represent the same thing.

The last one there is — when the Slack bot's done you have an image that gets generated. So Nate built this for his kid and I understand that he's shared quite a few of them already.

Cool. You start with a diagram of what you want to build and then you find out that in reality it doesn't match the idea. Right? You've got all of these different queues you got to wire up. Again, everything is in Vercel, so everything's a serverless function. And you then have to add retrying and limits for all of your different LLM steps. If anything fails, you've got to maintain all of the state and clean it up in between, validate inputs and outputs. And it's not one API route because you have the API route to handle the first time someone starts your Slack bot and every single time someone responds in the thread, you got to sort of resume the Slack bot and maintain the state in between. So there's a lot more components and I counted — there's about 12 different serverless functions we needed to go build this, but it isn't what I wanted.

So I love just thinking about code as workflows, talking about workflows, and then there's a pseudo-code of how I like explaining this. And this is what I wish it would look like. And you might have seen this earlier but we are announcing the **Workflow Development Kit**.

It's the idea of: let's try to make those functions reality and let's make it easy to actually write workflows the way that we think.

So to walk you through this, I'm going to go through a third example. We'll build an app together with workflow. I know we're going through three different examples, but also I hope you get the idea here that workflows are a very versatile paradigm. You can represent a lot of different things with workflows, whether it's AI agents or microservices or GPU video generation pipelines.

Cool. So the app we're building today is a birthday card generator. I can go in here, enter an email address, enter a prompt, and we should see a birthday card generated, and it'll get sent via email. There we go. Pretty simple.

And when you start this, it's a simple Next.js app. I have a POST request handler. Generate my text, generate image, and then send the birthday card. Now, that's great when your workflow is pretty simple, but agents are more complex, right? They're starting to do more things. They're starting to do web searches and run sandboxes and run some code in the background.

As your agents get longer, every single part of this is brittle. And if any step here fails, you just lose all of your tokens. You lose everything that happened in between. There's no retrying out of the box and there's no observability. All of those things still have to get added and wired in.

Also, you can't run this entire thing in a single serverless function.

So, I'll show you how you make a lot of that easier with workflow. I'll start by actually moving each of those steps into their own step. And the `use step` directive effectively sort of lets you know that you're going to run this single step in the background and put a queue in front of it. If you use Next.js, you must be familiar with `use server`. It's kind of the same thing. We were inspired by the same directive, but we've made this to work across any framework.

So you can do this with Next.js, Nitro, and a few others. Cool. The compiler will compile every single route into its own API route and then automatically handle stitching the queue in front.

So I can head back to my workflow and now this is kind of the function that I wanted. You can just use async/await in JavaScript and just call your steps. Workflow functions a little bit differently, right? The workflow lets you basically suspend and run the step in the background. And then we can resume the workflow, rehydrate state, and continue where we left off.

But while your workflow is suspended, it's not consuming any resources.

I'll go ahead and finish up this example by switching my POST handler to actually kick off the workflow in the background. And then one last thing I have to do here is set up Next.js — every framework has a slightly different configuration but you essentially just import and follow your framework's configuration and that's the entire setup besides installing workflow.

Cool. Let's go to this example again. Going to enter my email. Fun fact, this is the same video because it kind of works. All right, you got the idea. But I'll show you the logs and what's happening over here. And it's kind of easy to miss if you don't look too closely. But you should see multiple — multiple 200 status codes here because we aren't running everything in one function, right? So as we do all these different steps and as they get completed, we're sort of jumping between these flow and step endpoints and everything orchestrates across multiple services.

Cool. We talked about steps and workflows. Fundamentally, workflows have this ability to suspend and resume and rehydrate from where they are without consuming any resources in between. Steps are one way to do that. But the way that I'm personally most excited about is **webhooks**.

Webhook is a way for you to basically respond to external events and suspend in between. I'll show you how it works. To do that, I want to add a new feature to my birthday card app. I want to allow friends to RSVP for the birthday and then include all of those RSVPs on the email that I'm going to send out.

So to do that, I'll start by importing `webhook` from the workflow package. I can now create a webhook inside my workflow. Now, every single webhook has its own unique URL that allows you to suspend and resume that workflow when you're done. So, I can send that URL inside an RSVP email to a friend. And now I can simply `await webhook` like a regular promise in JavaScript.

Right? These are the three craziest lines of JavaScript I've written because this is a promise that can suspend and wait till someone clicks on that button. And as soon as someone does click on that button, you're back into the workflow with your text and image rehydrated and you continue right where you left off.

*[Applause]*

So it's cool for the little RSVP email example, but webhooks are a really powerful paradigm. I could send those URLs to some sort of third-party processor, maybe Stripe or OpenAI, as you run a batch job in the background. I could also send it to my own GPU inference.

This is what I wish I had for Windsor where we had one GPU step running somewhere else and I can have a backend that calls my URL back so I can still have all the orchestration in one function.

I'm going to wrap up this example by waiting for the RSVP. Since it's just a webhook, I can get access to the request because I want to collect the actual RSVP response and then include that in the email that I send out.

Cool. Let's go ahead and check out this example. I'll start my dev server. Open up the birthday card app. Writing a birthday card for a friend who works in the team who loves climbing and drinking coffee. And we'll send out the email. You're going to see in the little RSVP email box this time. All right.

So, the image and text generated again. And now I get the RSVP email, but the workflow is still stuck where it is up until I click the button — at which point it triggered a whole new API route and continued the process. So the workflow is complete and I get a birthday card.

Steps and webhooks are just promises. And since they're just promises, anything that you could model with promises, you can model with workflows, right? Or the other way around. Anything I want to model with workflows, I can model as promises. So if I want to extend this to support multiple friends, it's actually this easy. I can switch `friend` to be an array of friends.

I can go create a webhook for every single friend so everyone gets their own unique URL. I can then send out all of those emails in parallel. Right? So this is actually spinning out multiple different serverless functions and you're not in a single process. I can then simply just `await` all the webhooks.

So now I'm waiting for every single person to click their button — click a button in their email — before this function continues. And of course, I'll just collect all of the RSVPs from everyone and send them all out. That's the diagram that would represent this. And I now have code that looks eerily similar.

Cool. Before I run this example again, I want to show you one last thing. I want to add a last feature where I want to send the birthday card out when it's the person's actual birthday. So we talked about webhooks, we've talked about steps, now we'll talk about **sleep**. Sleep is just another function from workflow that lets you suspend the workflow for some amount of time.

And now I can sleep till the person's birthday, automatically resuming when it's the right time to send. And those are the three ways that you suspend a workflow. Sleep is really powerful. You can sleep for an arbitrary amount of time. It'll just suspend and, you know, this could be minutes, weeks, or months.

But to finish up this example, I'll wait for the birthday. Tiny nitpick, and I almost didn't put this on the slides, but you might have noticed that if we waited for every single webhook, we would have — if someone doesn't RSVP, we never would have sent the birthday card. But I can fix that again just in JavaScript without having to go move around external resources. I'm simply not going to wait for all the webhooks — collect whatever I can get, and just leave for the birthday, send out the birthday card with whatever I get.

Here's the final workflow of what I'm trying to represent. And the code in the workflow match really well.

Cool. We'll run through one last example here. I'll create a birthday card. I did stop this to actually be 10 seconds in the example so we're not sitting here waiting for two months. We should see the image and text get generated, our RSVP email come through.

This time I rejected it — "but I'll be there, Peter" — and you actually will see two errors there where it's a 503. Effectively we implement sleep sort of as — it throws an error and then we can still resume with a retriable error because errors get retried. It's more in the docs.

I've shown you logs and I've shown you how workflows work. One of the things that we needed to do to actually make that work is you basically store the inputs and outputs of every single step onto an event log. And because you're doing that, you have this entire event log that gives you free auditing. You also have observability for free, right? So I'll give you a peek into what observability looks like.

And I haven't added any additional code. What you've seen pretty much is the code that you'll find on GitHub. But I can just run a CLI command and pull up a web trace viewer and look at the inputs and outputs of every function here, including those retries and sleeps.

Cool. We walked through three examples and as fun as it is to make birthday cards, I want to let you guys see a real example in production.

So, I'm excited to introduce Shabbum, an engineer from Mandolin, to give you a real demo. Thank you.

---

**Shabbum (Mandolin):**

At Mandolin, we build AI agents that take over repetitive administrative work from medical staff so they can focus on serving patients and providing them access to the drugs they need. Our AI automation platform processes over $10 billion worth of drugs every year.

Let's take a look at the role of AI agents in healthcare. Healthcare providers may spend more than 80% of their time reading documents, sending faxes, filling out forms, making phone calls, and finding the insurance — just from the perception of the actual treatment. What are the different types of work we're talking about?

Let's take a look at the high-level workflow. As you can see, a lot goes into making drugs accessible to patients. These are extremely manual steps that humans perform every day for hundreds of patients. They require a lot of precision around handling documents and phone calls and they require a lot of insurance-specific knowledge. Sometimes these steps may seem trivial, but they can take up to 3 weeks to be completed.

Taking a closer look, we can see something far more nuanced. This is BV — each of this can be a phone call. This is financial modeling — each of this is its own spreadsheet. This is medical policy review just to analyze one part of one insurance company's conditional drug policy. There's prior authorization.

Each of these represent tracking down a hidden website, filling out a 100-field form, making a phone call, sending a fax, filling out the same form again. As we saw, these are extremely complex and nuanced operations. And this is still just at a high level. We are building AI agents to automate these processes. And to help us automate these operations at scale, we use workflows.

They are the backbone of our autonomous agents, giving us the peace of mind with durable, reliable, traceable backends. At Mandolin, our fully automated processes rely on workflows — strict observability and auditability, both cornerstones of the medical space. For our human-in-the-loop operations, we must maintain the strictest standards of state management, especially as it pertains to patient data. Everything powered by workflows.

For today's demo, we'll be looking at a real-world example of prior authorization. This is the process of getting confirmation from the insurance company before a drug is administered that the insurance company will actually pay up. When submitting a prior authorization, the provider would start by searching online for a very specific PA form required by the insurance company.

They would go through different payer portals, websites, audited libraries, aggregation tools. There are hundreds of thousands of PA forms and they vary from payer to payer and sometimes for a single payer they can even vary from drug to drug. So with all that in mind, today we'll be exploring an AI agent that can take away some of this burden, saving hours of headache every day.

Let's take a look at the demo. So, I already have my server up and running over here. I'm going to start the workflow. Let's do `./test`. We can already see it got auto-populated. So, this is a background job. We will have a CLI tool just to see over here. I'm going to mention the name of the drug over here which is Humira. And then we also have Blue Cross Blue Shield — this is our insurance name. And we're going to use the OpenAI backend.

When I start this, the workflow starts over here. We can see that it has started. Now, let's take a look at the observability. If I do `workflow inspect runs web`, it will help me pull up the UI for the observability.

Let's take a look at this running workflow right now which we just started. We can see that the workflow started and the agents are up and running. Currently the research agent is ongoing. Each of the steps are clearly outlined with the inputs and the outputs. Let's take a look over here. We can see that it is still ongoing.

In the meantime, let me show you what does the code look like. This is the workflow and we use the `use workflow` primitive. You would see that we are using a `getWritable`. This is the streaming event aspect of the workflows where you can send in any kind of events back to the client. It's very easy to set up.

For example, over here when I'm saying "initialize packet" and I'm going to send an initialization message — I can go over here and show that `writer.write()`, right? I can send any events back to the client. So this way you can have realtime feedback to the clients.

If I go back and take a look at the actual AI agent, which is the `runResearchIteration`, it is going to run for the X amount of duration that we set up. If I go inside, there are three agents that we can see. One is the research agent, we have a recorder agent, and we have a quality assurance agent — all three of them working side by side to find the appropriate PA form, figuring out if it's the right PA form and moving on from there.

After it finds the PA form, we have a reasoner agent. The reasoner agent is looking at all of the history from all the three agents and figuring out if it needs to redo the entire loop or should it move on and break it out. When it breaks out, we have a human review step added over here. When I look into the human review, it's using webhooks which Renee just spoke about. We create the review webhook. We send it within the step where the human review is set up. You can send emails, Slack, whatever you want for the human review. For us, it's going to be within the workflow itself.

So we have different actions that have been shown over here — approve, reject, or correct where you can provide the link to the form that we want.

Now if I go back over here, we see that the webhook is going to await and it's going to wait till the review comes back. And once the review comes back, it will actually figure out what the next steps are based on the approval, correction, or rejection. Once the review has been completed, we basically end the workflow.

Now let's take a look at the output of the workflow. We saw that — okay, so it's still ongoing, the existing workflow. It can take up to 10 minutes. So let's take a look at one of the older runs which I did, which shows all of the steps that it took. We can see all of the reasoning steps.

It is streaming us the results — "this is what I'm thinking, this is what I'm doing." It's moving on to the recorder steps which is giving us the structured outputs. It's doing the QA analysis and the reasoning — "since I have one more iteration left, let me redo this again because I did not get a very high QA confidence score" — and this keeps on going.

Towards the end, when it finishes, you will get the human review required webhook URLs. These webhook URLs are created automatically by the webhooks platform / framework and you can just make a curl request or you can plug it into your UI to send the request. So over here I can just take this review request and send a curl command and it will finish the workflow for us.

Let's do it over here. And it just finished the workflow for us. There you go. A 200 request.

Now, this is just one of the agents that we built with workflows.

---

**Renee (closing):**

Awesome. We've walked through a few different workflows today and you can get started right now: `npm i workflow`.

I just learned that the website as well is starting to get a lot of traffic. So check it out before it goes down. It's on Vercel. It's not going to go down.

Cool. We're shipping today with support for Next.js, Nitro, and Hono as well. Hopefully by the end of the next couple days we'll have all of those as well.

Also one more thing — everything you've seen today across the demo that I showed you and Shabbum's was completely local. None of this touched a Vercel resource locally. We ran everything with the file system using local queues and storage. When you deploy this onto Vercel you get serverless functions to run your workflows and your steps. And we use Vercel Queues for resumability and persistence.

One more thing — it is open source. And if you look at the GitHub you can start creating your own "worlds" as well to deploy workflows anywhere. We're starting to work with more providers to build more runtimes with more cloud providers but also we already have support with the Postgres example and the community — like Jazz — building new worlds with their database.

At Vercel, we're running about a million workflows a day between v0, the Vercel Agent, and Mandolin. We're just getting started. We've shipped a couple of the bare essentials — steps, webhooks, sleep, streaming, a couple of other things. But there's a lot more coming up very soon.

Cool. `npm i workflow`.

*[Applause and cheering]*
