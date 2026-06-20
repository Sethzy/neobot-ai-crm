# 10 Years Building Vertical Software: My Perspective on the Selloff

**Author:** Nicolas Bustamante (@nicbstme)
**Source:** https://x.com/nicbstme/status/2023501562480644501
**Saved:** 2026-02-18

---

In the past few weeks, nearly $1 trillion was wiped from software and services stocks. FactSet dropped from a $20B peak to under $8B. S&P Global lost 30% in weeks. Thomson Reuters shed almost half its market cap in a year. The S&P 500 Software & Services Index, 140 companies, fell 20% year to date.

Last week, Anthropic released industry-specific plugins for Claude's Cowork — an AI agent designed specifically for knowledge workers that can autonomously handle complex research, analysis, and document workflows.

Wall Street called it a panic. I've spent the last decade building vertical SaaS. First @Doctrine, now the largest legal information platform in Europe (competing with LexisNexis, Westlaw etc) and then @fintool, an AI-powered equity research platform in the US that competes with Bloomberg, FactSet, and S&P Global today.

I built the kind of software that LLMs are now threatening. And I'm now building the kind of software that's doing the threatening. **I've been on both sides of this disruption.**

Here's what I see: LLMs are systematically dismantling the moats that made vertical software defensible. But not all of them. The result is a redrawing of what makes vertical software valuable and the multiple it deserves.

**In this article:**
- The ten moats that made vertical software defensible, and what LLMs do to each
- Why the market selloff is structurally justified but temporally exaggerated
- What the real threat actually is (it's not what you think)
- What replaces vertical software
- What comes next for the vertical software industry

---

## The Ten Moats of Vertical Software (and What LLMs Do to Each)

Vertical software is software built for a specific industry. Bloomberg for finance. LexisNexis for legal. Epic for healthcare. Procore for construction. Veeva for life sciences, etc.

These companies share a defining characteristic: they charge a lot and customers rarely leave. FactSet charges $15,000+ per user per year. Bloomberg Terminal costs $25,000 per seat. LexisNexis charges law firms thousands per month. And retention rates hover around 95%.

I would say that there are ten distinct moats. LLMs are attacking some of them while leaving others intact. Understanding which is which is the entire game.

---

### 1. Learned Interfaces → Destroyed

A Bloomberg Terminal user has spent years learning keyboard shortcuts, function codes, and navigation patterns. GP, FLDS, GIP, FA, BQ. These aren't intuitive. They're a language. And once you speak it fluently, switching to another platform means becoming illiterate again.

"We're a FactSet shop." "We're a Lexis firm." "We're a Bloomberg house." These aren't statements about data quality or feature sets. They're statements about software muscle memory. People have spent a decade learning the tool. That investment isn't transferable.

This was the most under-appreciated moat. **Knowledge workers pay to not relearn a workflow they've spent a decade mastering. The interface IS a big part of the value prop.**

At Doctrine, maintaining the interface was one of our biggest cost centers. Every UI change was a project: user research, design sprints, careful rollouts, handholding.

At Fintool, we have **no onboarding. No CSMs.** Our users type what they want in plain English and get an answer. There is no interface to learn because it's all chat. That entire cost center — the designers, the CSMs, the UI change management — just doesn't exist. The chat interface absorbed all those scaffoldings.

**LLMs collapse all proprietary interfaces into one: Chat.**

Consider what a financial analyst does today on Bloomberg:
1. Navigate to equity screening function
2. Set parameters using specialized syntax
3. Export results
4. Switch to DCF model builder
5. Input assumptions, run sensitivity analysis
6. Export to Excel, build presentation

Each step requires learned interface knowledge. Each step reinforces switching costs.

Now with an LLM agent: *"Show me all software companies with over $1B market cap, P/E under 30, and revenue growing over 20% year over year. Build a DCF model for the top 5. Run sensitivity analysis on discount rate and terminal growth."*

Three sentences. When the interface is natural language, years of muscle memory become worthless. The switching cost that justified $25K per seat per year dissolves.

---

### 2. Custom Workflows and Business Logic → Vaporized

Vertical software encodes how an industry actually works. A legal research platform doesn't just store caselaw — it encodes citational networks, Shepardize signals, headnote taxonomies, and the specific way a litigation associate builds a brief.

**LLMs turn all of this into a markdown file.**

Traditional vertical software encodes business logic in code: thousands of if/then checks, validation rules, compliance checks, approval workflows. Hardcoded by engineers over years. And not just any engineers — you need engineers who understand the domain, which is rare.

At Doctrine, we built a legal research workflow over several years with a team of engineers and legal experts. The business logic was spread across thousands of lines of Python, custom ranking algorithms, and hand-tuned relevance models.

At Fintool, we have a DCF valuation **skill**. It tells an LLM agent how to do a discounted cash flow analysis: which data to gather, how to calculate WACC by industry, what assumptions to validate. **It's a markdown file. Writing it took a week. Updating it takes minutes.** A portfolio manager who's done 500 DCF valuations can encode their entire methodology without writing a single line of code.

Years of engineering versus one week of writing. That's the shift.

The markdown skill is also better in important ways:
- Readable by anyone
- Auditable
- Customizable per user (customers write their own skills)
- Gets better automatically as the underlying model improves

**Business logic is migrating from code written by specialized engineers to markdown files that anyone with domain expertise can write.**

---

### 3. Public Data Access → Commoditized

A massive portion of vertical software's value was making hard-to-access data easy to query. FactSet makes SEC filings searchable. LexisNexis makes case law searchable.

At Doctrine, we built NLP pipelines, named entity recognition, dedicated ML models to classify decisions by legal domain, custom parsers for every court. Years of work. Genuine moat.

At Fintool, **we built none of that.** Zero NER. Zero custom parsers. Zero industry-specific classifiers. Why? Because frontier models already know how to navigate a 10-K. They understand the difference between GAAP and non-GAAP revenue. They can parse a nested table of segment disclosures without being taught the schema.

**The model IS the parser.**

The "making it searchable" layer — where a lot of the value and pricing power lived — is collapsing.

---

### 4. Talent Scarcity → Inverted

Building vertical software requires people who understand both domain and technology. Finding an engineer who can write production code AND understands how credit derivatives are structured is extremely rare.

At Doctrine, hiring was brutal. Every week we held internal lectures where lawyers taught engineers how the legal system actually worked. Months before a new engineer was productive.

At Fintool, domain experts (portfolio managers, analysts) write their methodology directly into markdown skill files. **The domain expertise, which was always the abundant resource, can now become software directly without the engineering bottleneck.**

LLMs make the engineering trivially accessible, which means the scarce resource (domain expertise) is suddenly abundant in its ability to become software. **This is why the barrier to entry collapses so dramatically.**

---

### 5. Bundling → Weakened

Bloomberg started with market data, then added messaging, news, analytics, trading, compliance. S&P Global's acquisition of IHS Markit for $44B was exactly this strategy — the bundle becomes the moat.

**LLM agents break the bundling moat because the agent IS the bundle.**

At Fintool, alerts are a prompt. Watchlists are a prompt. Portfolio screening is a prompt. A customer says "alert me when any company in my portfolio mentions tariff risk in an earnings call" and it just works. The agent orchestrates across ten different specialized tools in a single workflow.

When the integration layer moves from the software vendor to the AI agent, the incentive to buy a bundle evaporates. Why pay Bloomberg's premium for the entire suite when an agent can cherry-pick the best (or cheapest) provider for each capability?

---

### 6. Private and Proprietary Data → **Stronger**

Some vertical software companies own or license data that doesn't exist anywhere else. Bloomberg collects real-time pricing data from trading desks worldwide. S&P Global owns credit ratings. Dun & Bradstreet maintains business credit files on 500M+ entities.

**If your data genuinely cannot be replicated, LLMs make it MORE valuable, not less.**

Bloomberg's real-time pricing data from trading desks? Can't be scraped. Can't be synthesized. In an LLM world, this data becomes the scarce input that every agent needs. Bloomberg's pricing power on proprietary data may actually increase.

The test is simple: **Can this data be obtained, licensed, or synthesized by someone else? If no, the moat holds. If yes, you're in trouble.**

MCP (Model Context Protocol) is turning every data provider into a plug-in. When your data is available as a Claude plugin, the "making it accessible" premium disappears.

**The irony: LLMs accelerate the bifurcation. Companies with proprietary data win bigger. Companies without it lose everything.**

If your data can be obtained, licensed, or synthesized elsewhere — you're not safe. The AI agent will own the relationship with the customer. You become a **supplier to the agent**, not a vendor to the customer.

This is aggregation theory playing out in real-time: the aggregator (the agent) captures the user relationship and margin, while the suppliers (data vendors) compete on price to feed the platform.

---

### 7. Regulatory and Compliance Lock-in → Structural

HIPAA doesn't care about LLMs. FDA certification doesn't get easier because GPT-5 exists. SOX compliance requirements don't change because Anthropic released a new plugin.

In fact, regulatory requirements may **slow** LLM adoption in exactly the verticals where compliance lock-in is strongest. A hospital can't replace Epic with an LLM agent because the LLM agent isn't HIPAA certified, doesn't have the required audit trails, and hasn't been validated by the FDA for clinical decision support.

---

### 8. Network Effects → Sticky

Bloomberg's messaging function (IB chat) is the de facto communication layer for Wall Street. If every counterparty uses Bloomberg, you have to use Bloomberg. Not because of the data — because of the network.

LLMs don't break network effects. If anything, they might make communication networks more valuable.

---

### 9. Transaction Embedding → Durable

When you're embedded in the transaction, switching means interrupting revenue. Nobody does that voluntarily.

If your software processes payments, originates loans, or settles trades, an LLM doesn't disintermediate you. It might sit on top of you as a better interface, but the rails themselves remain essential.

**Stripe isn't threatened by LLMs. Neither is FIS or Fiserv.**

---

### 10. System of Record Status → Threatened Long-Term

When your software is the canonical source of truth for critical business data, switching is existentially risky.

**But agents are quietly building their own system of record.**

AI agents don't just query existing systems. They read your SharePoint, your Outlook, your Slack. They write detailed memory files that persist across sessions. Over time, the agent accumulates a richer, more complete picture of a user's work than any single system of record.

Salesforce sees your CRM data. Outlook sees your emails. SharePoint sees your documents. **The agent sees all three, and remembers.**

This doesn't happen overnight. But directionally, agents are building their own system of record from the ground up.

---

## The Net Effect: Barrier to Entry Collapses

**Five moats destroyed or weakened. Five that hold.** But the five that break are the ones that kept competitors out.

Before LLMs, building a credible competitor to Bloomberg or LexisNexis required:
- Hundreds of domain-literate engineers
- Years of development time
- Massive data licensing deals
- Enterprise sales teams
- Regulatory certifications

Result: most verticals had 2-3 serious competitors.

After LLMs: a small team with frontier model APIs, domain expertise, and good data pipelines can build a product that handles 80% of what a vertical software does within months.

**Fintool was built by a team of six.** We serve hedge funds that previously relied exclusively on Bloomberg and FactSet. Not because we have better data — because our AI agent delivers answers faster and more intuitively than a terminal that requires years of training to master.

The critical insight: **competition doesn't increase linearly — it explodes combinatorially.** You don't go from 3 incumbents to 4. You go from 3 to 300. And that's what craters pricing power.

---

## The Nuance: This is a Multi-Year Transition, Not an Overnight Collapse

FactSet's clients are on multi-year contracts. Bloomberg Terminal contracts are typically 2-year minimums. Enterprise procurement cycles are measured in quarters and years, not days.

**The revenue cliff is real but it's a slope, not a cliff.**

But here's what the market already understands: you don't need revenue to decline for the stock to crash. You need the **multiple to compress**. A financial data company that traded at 15x revenue when it had pricing power and 95% retention might trade at 6x when the market believes both are eroding. Revenue stays flat. The stock drops 60%.

**The market isn't pricing in a revenue collapse. It's pricing in the end of the premium multiple,** because the moats that justified it are dissolving.

---

## The Real Threat

The real threat isn't the LLM itself. It's a **pincer movement** that vertical software incumbents didn't see coming.

**From below:** hundreds of AI-native startups entering every vertical. When building required 200 engineers and $50M in data licensing, markets consolidated to 3-4 players. When it requires 10 engineers and frontier model APIs, the market fragments violently. Competition goes from 3 to 300.

**From above:** horizontal platforms going deep into vertical territory for the first time. Microsoft Copilot inside Excel now does AI-powered DCF modeling and financial statement parsing. Copilot inside Word does contract review and case law research. **The horizontal tool becomes vertical through AI, not through engineering.**

Anthropic is doing the same thing — and I'm watching it up close because Fintool is an Anthropic-backed company. Claude is going all-in on vertical. The playbook is terrifyingly simple: a general-purpose agent harness (the SDK) + pluggable data access (MCP) + domain-specific skills (markdown files). **That's it. That's the entire stack.**

**Software is becoming headless.** The interface disappears. Everything flows through the agent. What matters isn't the software anymore — it's owning the customer relationship and use cases, which means owning the agent itself.

---

## A Framework for Assessing Risk

### High Risk: The Search Layer
If your primary value is making data searchable through a specialized interface, and the underlying data is public or licensable, you are in serious trouble.

- Financial data terminals built on licensed exchange data
- Legal research platforms built on public case law
- Patent search tools

These companies traded at 15-20x revenue because of interface lock-in and limited competition. Both are evaporating.

### Medium Risk: The Mixed Portfolio
Companies with a mix of defensible and exposed business lines. The key question: what percentage of revenue comes from moats that LLMs can't touch?

### Lower Risk: Regulatory Fortresses
If your moat is regulatory certification, compliance infrastructure, and deep integration with mission-critical workflows, LLMs are barely relevant to your competitive position in the medium term.

---

## The Test

For any vertical software company, ask three questions:

1. **Is the data proprietary?** If yes, the moat holds. If no, the accessibility layer is collapsing.
2. **Is there regulatory lock-in?** If yes, LLMs don't change the switching cost equation. If no, switching costs are primarily interface-driven and dissolving.
3. **Is the software embedded in the transaction?** If yes, LLMs sit on top of you, not instead of you. If no, you're replaceable.

**Zero "yes" answers: high risk. One: medium risk. Two or three: you're probably fine.**

---

## What I've Learned Building on Both Sides

When I built Doctrine starting in 2016, one of the moats was the interface. We built beautiful search experiences over case law and legislation. Most of the data was public but our interface and search made it accessible. **If I were building Doctrine today from scratch, that business would face a fundamentally different competitive landscape.**

The vertical SaaS reckoning isn't about all vertical software dying. It's about the market finally distinguishing between companies that own something genuinely scarce — that is safe from LLM agents — and companies that were merely making public information accessible through learned interfaces.

**The former still has pricing power. The latter is getting repriced to zero.**

---

*Tags: #vertical-saas #llm-disruption #moats #fintool #ai-agents #business-strategy #financial-software*
