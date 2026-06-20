# Model-Market Fit

**Author:** Nicolas Bustamante
**Published:** January 20, 2026
**Source:** https://www.nicolasbustamante.com/p/model-market-fit

## Subtitle

Product-market fit has a prerequisite that most AI founders ignore. Before the market can pull your product, the model must be capable of doing the job. That's Model-Market Fit.

---

## The Andreessen Framework, Updated

In June 2007, Marc Andreessen published what became the defining essay on startup strategy. "The Only Thing That Matters" argued that of the three elements of a startup—team, product, and market—**market matters most**. A great market pulls the product out of the startup. The product doesn't need to be great; it just has to basically work.

Andreessen's insight has guided a generation of founders. But nineteen years later, something has changed. A new variable has entered the equation. One that determines whether the market can pull anything at all.

**That variable is the model.**

For AI startups, there is a prerequisite layer beneath product-market fit: **the degree to which current model capabilities can satisfy what a market demands**.

I call it **Model-Market Fit, or MMF**.

When MMF exists, Andreessen's framework applies perfectly. The market pulls the product out. When it doesn't, no amount of brilliant UX, go-to-market strategy, or engineering can make customers adopt a product whose core AI task doesn't solve their job to be done.

---

## When MMF Unlocks, Markets Explode

The pattern is unmistakable once you see it. A model crosses a capability threshold. Within months, a vertical that had been dormant for years suddenly explodes with activity.

### Legal AI: GPT-4 (March 2023)

For years, legal tech AI was stuck below scale. There were plenty of companies but none broke through. Document review tools that required more human oversight than they saved. Contract analysis that missed critical clauses. Every legal startup before 2023 struggled to cross $100M ARR.

I remember this firsthand. I founded [Doctrine](http://www.doctrine.com) in 2016, which grew to become the leading AI legal platform in Europe. But it was incredibly hard to raise money because all companies were sub-scale and the market wasn't hot at all. Investors saw legal AI as a niche with limited upside.

The market existed. Law firms desperately wanted automation. But the state-of-the-art models couldn't handle the core tasks lawyers needed. BERT and similar transformer models excelled at classification—like sorting documents, identifying contract types, flagging potential issues. But legal work requires **generation and reasoning**: drafting memos that synthesize complex case law, summarizing depositions while preserving nuanced arguments, generating discovery requests tailored to specific fact patterns.

Traditional ML could categorize a contract as "employment" or "NDA," but it couldn't write a coherent brief explaining why a non-compete clause was unenforceable under California law.

**Then GPT-4 arrived in March 2023.**

Within eighteen months, Silicon Valley startups raised over hundreds of millions. Doctrine's business is on fire. Thomson Reuters acquired Casetext for $650 million. Dozens of legal AI startups emerged.

**The legal AI market minted more unicorns in 12 months than in the previous 10 years combined.**

The market hadn't changed. The model capability threshold had been crossed.

### Coding: Claude 3.5 Sonnet (June 2024)

Similarly, coding assistants existed before Sonnet. GitHub Copilot had millions of users. But there's a difference between autocomplete that occasionally helps and an AI that genuinely understands your codebase and creates high-quality code for you.

I experienced this firsthand. I tried Cursor early on, before Sonnet. It was meh. I installed it, tested it for a few days, deleted it. Did the same thing again a month later. Same result… interesting demo, not a workflow.

**Then Claude 3.5 Sonnet dropped!**

Within a week, I couldn't work without Cursor. Neither could anyone on my team. The product became the workflow. We weren't "using an AI assistant," we were pair programming with something that understood our entire codebase.

Cursor's growth went vertical. Not because they shipped some brilliant new feature. Because the underlying model crossed the threshold that made their product *actually work*. They got Model Market Fit.

### The Pattern

**The most important thing is MMF.** The startups that won weren't necessarily first, but they were prepared when the model capability threshold was finally crossed. So far in coding or legal, none of the incumbents won. It was always new players.

Today's leading legal startups had spent months understanding exactly how lawyers work—like what output formats they need, what compliance requirements exist, how associates actually research cases.

> **The race doesn't go to the first mover. It goes to the first to product-market fit after model-market fit exists.**

---

## When MMF Doesn't Exist, Nothing Works

The corollary is equally important: when MMF doesn't exist, the market cannot pull. The demand is there. The willingness to pay is there. But the core task doesn't work. Let's review some examples.

### Mathematical Proofs

Mathematicians would love an AI that could prove novel theorems. The market is real—research institutions, defense contractors, and tech companies would pay millions for genuine mathematical reasoning.

But even the most advanced models can't do it consistently. They can verify known proofs. They can assist with mechanical steps. They can occasionally produce insights on bounded problems. But originating novel proofs on open problems? The capability threshold remains uncrossed.

GPT-5, o1, o3... each generation improves incrementally, but we're not at the point where you can feed an AI an open conjecture and expect a rigorous proof. Yet.

### High-Stakes Finance

Investment banks and hedge funds desperately want AI that can perform comprehensive financial analysis. The market is massive; a single successful trade or M&A deal can generate hundreds of millions in fees.

But AI remains surprisingly bad at the core tasks that matter most. Excel output is still unreliable when dealing with complex financial models. More critically, AI struggles to combine quantitative analysis with qualitative insights from 200-page documents... exactly what analysts spend their days doing.

A human analyst reads through earnings calls, regulatory filings, and industry reports, then synthesizes that qualitative intelligence with spreadsheet models to make investment recommendations. AI can handle pieces of this workflow, but the end-to-end reasoning that justifies million-dollar positions? The capability gap is wide today.

This will obviously change soon. But for now, the human remains in the loop not as oversight, but as the primary decision-maker.

### The Benchmark Gap

The difference between verticals with MMF and those without is stark. Compare two benchmarks from Vals.ai:

**LegalBench** (legal reasoning tasks): Top models hit **87% accuracy**. Gemini 3 Pro leads at 87.04%, with multiple models clustered above 85%. This is production-grade performance. Accurate enough that lawyers can trust the output with light review.

**Finance Agent** (core financial analyst tasks): Top models hit **56.55% accuracy**. Even GPT-5.1, the current leader, barely crosses the halfway mark. Claude Sonnet 4.5 with extended thinking sits at 55.32%.

**That's a 30-point gap. Legal has MMF. Finance doesn't.**

The benchmarks reveal what intuition suggests: models have crossed the threshold for legal reasoning but remain fundamentally unreliable for financial analysis. You can ship a legal AI product today. A finance AI product that does the *actual job* of an analyst? Very soon but not now.

### Autonomous Drug Discovery

The pharmaceutical industry has invested billions in AI-driven drug discovery. The market is enormous because a single successful drug is worth tens of billions.

Yet the breakthroughs remain elusive. AI can accelerate certain steps: identifying candidate molecules, predicting protein structures (AlphaFold was transformative here), optimizing clinical trial design. But the end-to-end autonomous discovery that would justify the valuations? It doesn't exist.

The human remains in the loop not because the workflow is designed that way, but because the AI can't actually do the job.

---

## Identifying Missing MMF

There's a reliable signal for missing MMF: **examine how "human-in-the-loop" is positioned**.

**When MMF exists**, human-in-the-loop is a feature. It maintains quality, builds trust, handles edge cases. The AI does the work; the human provides oversight.

**When MMF doesn't exist**, human-in-the-loop is a crutch. It hides the fact that the AI can't perform the core task. The human isn't augmenting—they're compensating. Strip away the human, and the product doesn't work.

> **The test is simple: if all human correction were removed from this workflow, would customers still pay? If the answer is no, there's no MMF. There's only a demo.**

---

## The Strategic Question: Build for Now or Build for Later?

This creates a brutal strategic dilemma. Do you build for current MMF or anticipated MMF?

### The Case for Waiting

If MMF doesn't exist today, building a startup around it means betting on model improvements that are on someone else's roadmap. You don't control when or whether the capability arrives. You're burning runway while Anthropic and OpenAI decide your fate.

Worse, you might be wrong about what capability is needed. Models might scale differently than you expect. The 80% to 99% accuracy gap that your vertical requires might be five years away, or it might never close in the way you imagined.

Of course, if you believe in Artificial General Intelligence, then you know that models will eventually be able to do pretty much anything. But "eventually" is doing a lot of work in that sentence. The question isn't whether AI will solve the problem; it's when, and whether your startup survives long enough to see it (which is a function of your runway).

### The Case for Being Early

But there's a counterargument often shared at Y Combinator, and it's compelling.

When MMF unlocks, you need more than just model capability. You need:

- Domain-specific data pipelines
- Regulatory relationships
- Customer trust built over years
- Deep workflow integration
- Understanding of how professionals actually work

Legal startups didn't just plug in GPT-4. They had already built the scaffolding. When the model arrived, they were ready to run.

There's also the question of influence. The teams closest to the problem shape how models get evaluated, fine-tuned, and deployed. They're not passively waiting for capability; they're defining what capability means in their vertical.

---

## The Resolution

The question isn't whether to be early. It's **how early**, and **what you're building while you wait**.

**The dangerous zone is the middle: MMF that's 24 to 36 months away.** Close enough to seem imminent. Far enough to burn through multiple funding rounds waiting.

This is where conviction and runway become everything. If you're betting on MMF that's 2+ years out, you better be in a gigantic market worth the wait.

Consider healthcare and financial services. These markets are so massive that even Anthropic and OpenAI are going all-in despite very mixed current results. The potential upside justifies positioning early, even if the models aren't quite there yet. When you're targeting trillion-dollar markets, the risk-reward calculation changes entirely.

> **The math is simple: expected value = probability of MMF arriving × market size × your likely share.**

---

## Measuring MMF

Product-market fit has famously resisted precise measurement. Andreessen described it qualitatively: *"You can always feel when product/market fit isn't happening... And you can always feel product/market fit when it's happening."*

MMF is similarly intuitive, but we can be more specific.

### The MMF Test

> **Can the model, given the same inputs a human expert receives, produce output that a customer would pay for without significant human correction?**

This test has three components:

1. **Same inputs**: The model gets what the human would get—documents, data, context. No magical preprocessing that a real workflow couldn't provide.

2. **Output a customer would pay for**: Not a demo. Not a proof of concept. Production-quality work that solves a real problem.

3. **Without significant human correction**: The human might review, refine, or approve. But if they're rewriting 50% of the output, the model isn't doing the job.

### The 80/99 Gap

In unregulated verticals, 80% accuracy might be enough. An AI that writes decent first drafts of marketing copy creates value even if humans edit heavily.

In regulated verticals—finance, legal, healthcare—80% accuracy is often useless. A contract review tool that misses 20% of critical clauses isn't augmenting lawyers; it's creating liability. A medical diagnostic that's wrong one time in five isn't a product; it's a lawsuit haha!

**The gap between 80% and 99% accuracy is often infinite in practice.** It's the difference between "promising demo" and "production system."

Many AI startups are stuck in this gap, raising money on demos while waiting for the capability that would make their product actually work.

---

## The Agentic Threshold

There's a second capability frontier that most discussions of MMF miss: **the ability to work autonomously over extended periods**.

Current MMF examples (legal document review, coding assistance) are fundamentally short-horizon tasks today. Prompt in, output out, maybe a few tool calls. The model does something useful in seconds or minutes.

But the highest-value knowledge work isn't like that. A financial analyst doesn't answer one question; they spend days building a model, stress-testing assumptions, and synthesizing information across dozens of sources. A strategy consultant doesn't produce a single slide; they iterate through weeks of research, interviews, and analysis. A drug discovery researcher doesn't run one experiment; they design and execute campaigns spanning months.

These workflows require something models can't yet do reliably: **sustained autonomous operation**.

The agentic threshold isn't just "can the model use tools." It's:

- **Persistence**: Can it maintain goals and context across hours or days?
- **Recovery**: Can it recognize failures, diagnose problems, and try alternative approaches?
- **Coordination**: Can it break complex objectives into subtasks and execute them in sequence?
- **Judgment**: Can it know when to proceed versus when to stop and ask for guidance?

Today's agents can handle tasks measured in minutes. Tomorrow's need to handle tasks measured in days. That's not an incremental improvement—it's a phase change in capability.

This is why finance doesn't have MMF despite models being "good at reading documents." Reading a 10-K is a 30-second task. Building an investment thesis is a multi-day workflow requiring the agent to gather data, build models, test scenarios, and synthesize conclusions—all while maintaining coherent reasoning across the entire process.

> **The next wave of MMF unlocks will come from smarter models AND models that can work for days on the same task.**

---

## The Structural Point

Andreessen's core insight was that market matters more than team or product because a great market pulls the product out of the startup. The market creates the gravitational force.

**The AI corollary: model capability is the prerequisite for that gravitational pull to begin.**

No market, however large and hungry, can pull a product that doesn't work. And in AI, "doesn't work" is determined by the model, not by your engineering or design. You can build the most beautiful interface, the most elegant workflow, the most sophisticated data pipeline… and if the underlying model can't perform the core task, none of it matters.

> **MMF → PMF → Success. Skip the first step, and the second becomes impossible.**

This is both constraint and opportunity. For founders, it means being ruthlessly honest about where capability actually is versus where you hope it will be. For investors, it means evaluating not just market size and team quality, but the gap between current model capability and what the market requires.

And for everyone building in AI: the question isn't just whether the market wants what you're building. **It's whether the models can deliver it.**

That's the only thing that matters.

---

## Visual Framework: Model-Market Fit Matrix

![MMF Framework](screenshots/article2-diagram1.png)

```
┌───────────────────────────────────────────┐
│    THE MODEL-MARKET FIT FRAMEWORK         │
├───────────────────────────────────────────┤
│                                           │
│      Model Capability                     │
│           ▲                               │
│      99%  │  ┌─────────────┐             │
│           │  │   LEGAL     │ ← MMF ✓     │
│      87%  │  │   (GPT-4)   │             │
│           │  └─────────────┘             │
│           │                               │
│      80%  ├──────────────────────         │
│           │  Threshold for               │
│           │  production use              │
│           │                               │
│      56%  │  ┌─────────────┐             │
│           │  │  FINANCE    │ ← No MMF ✗  │
│           │  │  (GPT-5.1)  │             │
│           │  └─────────────┘             │
│           │                               │
│           └───────────────────────────▶   │
│                    Time                   │
│                                           │
│  When model crosses 80-90% threshold:    │
│  Market EXPLODES                          │
│                                           │
└───────────────────────────────────────────┘
```

![Market Explosion Timeline](screenshots/article2-diagram2.png)

```
┌───────────────────────────────────────────┐
│      MARKET EXPLOSION PATTERN             │
├───────────────────────────────────────────┤
│                                           │
│  Legal AI Market                          │
│  Funding                                  │
│  ($M)                                     │
│    │                                      │
│ 800│              ▲                       │
│    │             ╱│╲                      │
│ 600│            ╱ │ ╲                     │
│    │           ╱  │  ╲  ← GPT-4 Launch   │
│ 400│          ╱   │   ╲    (Mar 2023)    │
│    │         ╱    │    ╲                  │
│ 200│________╱     │     ╲                 │
│    │              │                       │
│  0 └──────────────┼──────────────────▶    │
│    2015  2018  2021│2023  2024  2025      │
│                    │                      │
│  Before MMF:  Flat, sub-scale             │
│  After MMF:   Vertical explosion          │
│                                           │
└───────────────────────────────────────────┘
```

![Strategic Timing Matrix](screenshots/article2-diagram3.png)

```
┌───────────────────────────────────────────┐
│    STRATEGIC TIMING MATRIX                │
├───────────────────────────────────────────┤
│                                           │
│        Time Until MMF                     │
│                                           │
│   0-6      6-24     24-36      36+        │
│  months   months   months    months       │
│    │        │        │         │          │
│    │        │        │         │          │
│  BUILD    BUILD    DANGER    WAIT         │
│   NOW    EARLY     ZONE      (or be      │
│  (Legal) (Health)           billionaire) │
│                                           │
│  ✓ Clear  ✓ Big    ⚠ Burn   ✗ Too        │
│    path     TAM      runway    early      │
│                                           │
│  ✓ Fast   ✓ Build  ⚠ Model  ✗ No         │
│    PMF      moat     risk      control    │
│                                           │
│  Examples:                                │
│  • Legal AI      (0-6 mo) ← Ship now      │
│  • Healthcare    (6-24 mo) ← Build moat   │
│  • Finance       (12-24 mo) ← Watch close │
│  • Drug Discovery (24-36 mo) ← Danger     │
│  • Math Proofs    (36+ mo) ← Too early    │
│                                           │
└───────────────────────────────────────────┘
```

![The MMF Test Decision Tree](screenshots/article2-diagram4.png)

```
┌───────────────────────────────────────────┐
│        THE MMF TEST (Decision Tree)       │
├───────────────────────────────────────────┤
│                                           │
│  Can AI do the core task?                 │
│           │                               │
│     ┌─────┴─────┐                         │
│     │           │                         │
│    YES          NO                        │
│     │           │                         │
│     ▼           ▼                         │
│  Without     Human is                     │
│  human?      required?                    │
│     │           │                         │
│  ┌──┴──┐     ┌──┴──┐                      │
│  │     │     │     │                      │
│ YES   NO    Augment Compensate            │
│  │     │     │       │                    │
│  ▼     ▼     ▼       ▼                    │
│ MMF   MMF   MMF    NO MMF                 │
│ ✓✓    ✓     ✓      ✗                     │
│                                           │
│ Fully  With  Human  Demo                  │
│ Auto   Review Reviews Only                │
│                                           │
│ Examples:                                 │
│ ✓✓ Code completion (GitHub Copilot)      │
│ ✓  Legal doc review (Harvey AI)          │
│ ✓  Contract drafting (Doctrine)          │
│ ✗  Financial modeling (most tools)       │
│ ✗  Drug discovery (all current)          │
│                                           │
└───────────────────────────────────────────┘
```

![The Agentic Threshold](screenshots/article2-diagram5.png)

```
┌───────────────────────────────────────────┐
│       THE AGENTIC THRESHOLD               │
├───────────────────────────────────────────┤
│                                           │
│  Task Horizon Required                    │
│        ▲                                  │
│        │                                  │
│  Weeks │  ┌─────────────────┐            │
│        │  │ Drug Discovery  │ ← No MMF   │
│        │  │ Strategy Work   │            │
│   Days │  ├─────────────────┤            │
│        │  │ Financial       │ ← Emerging │
│        │  │ Analysis        │            │
│  Hours │  ├─────────────────┤            │
│        │  │ Legal Research  │ ← Has MMF  │
│   Min  │  │ Code Writing    │            │
│        │  └─────────────────┘            │
│        │                                  │
│        └───────────────────────────▶      │
│              Capability                   │
│                                           │
│  Current Models: Minutes to hours         │
│  Next Wave: Days to weeks                 │
│                                           │
│  Requirements for long-horizon work:      │
│  • Persistence (maintain context)         │
│  • Recovery (handle failures)             │
│  • Coordination (break down tasks)        │
│  • Judgment (know when to ask)            │
│                                           │
└───────────────────────────────────────────┘
```

---

## Key Takeaways

1. **MMF is the prerequisite to PMF** - No market can pull a product whose AI doesn't work
2. **The 80/99 gap is infinite** - Demo vs production system
3. **Timing is everything** - Build early enough to prepare, not so early you die waiting
4. **Human-in-the-loop test** - Are humans augmenting or compensating?
5. **Agentic threshold matters** - Long-horizon tasks need sustained autonomous operation
6. **Market explosions happen fast** - When MMF unlocks, winners emerge in 12-18 months
7. **Incumbents rarely win** - New players who prepared win the MMF unlock moment

---

## Diagrams Reference

All diagrams saved in: `extracted_content/Important Articles/Fintool/screenshots/`

1. **article2-diagram1.png** - Model-Market Fit Framework
2. **article2-diagram2.png** - Market Explosion Timeline
3. **article2-diagram3.png** - Strategic Timing Matrix
4. **article2-diagram4.png** - The MMF Test Decision Tree
5. **article2-diagram5.png** - The Agentic Threshold

---

**Related Articles:**
- The Crumbling Workflow Moat: Aggregation Theory's Final Chapter (companion piece)
- The RAG Obituary: Killed by Agents, Buried by Context Windows

**Tags:** #model-market-fit #mmf #pmf #ai-startups #capability-threshold #vertical-ai #strategic-timing #market-pull #legal-ai #financial-ai
