# Learnings from 20,000 AI Agents in Production

**Author:** Portal One+ (LinkedIn)
**Source:** https://www.linkedin.com/feed/update/urn:li:activity:7440542884430450689/
**Date:** ~March 2026
**Context:** Largest single user-facing deployment of OpenClaw agents in the wild. Posted 32 days after launch.

---

## Key Thesis

The most expensive part of running a persistent agent is not thinking — it's **remembering**. 49% of total compute goes to rebuilding context at session start. Messages 2 through 50 are nearly free (97% cache hits). The entire cost structure is front-loaded per session, not per message.

---

## 1/ For VCs Evaluating AI Agent Companies

### "Is flat pricing broken for AI agents?"

At $49/month, only **47% of users were organically profitable** in brute force approach. There is no price where 70%+ break even on a flagship model. The top 15% of users generate 64% of all compute. But when an "unlimited" user spends $420 on compute and wins a $200k government grant, how do you price the product? Still figuring this out...

### "Should anyone optimize for margin right now?"

Compute drops roughly **50% every 6 months**. Our margin goes from 58% today to 89% in 12 months without changing prices. If cost solves itself, the only race is distribution. Every dollar spent optimizing unit economics today could be a dollar that should have gone to growth. Prove me wrong.

---

## 2/ For VP of Engineering at an AI Company

### "What's the most expensive part of running a persistent agent?"

Not thinking. **Remembering.**

- **49% of total compute** goes to the agent rebuilding context at session start — who you are, what you care about, what happened yesterday.
- **Messages 2 through 50 are nearly free** (97% cache hits).
- The entire cost structure is **front-loaded per session**, not per message.
- If you're pricing by messages, you're measuring the wrong thing.
- But don't forget **KV-caching** — cheapest most massive money saver.

### "What happens when you swap the model underneath?"

Switched **Opus 4.6, Gemini 3.1 Pro, and Sonnet 4.6** across 10% of users for 7 days:

- **Zero complaints.**
- Little measurable difference in engagement between Opus 4.6 and Gemini 3.1 Pro.
- **Margin went from 58% to 92%.**
- If users can't tell — what are they actually paying for? Not the model. **The memory, the orchestration, the relationship.** That changes what "moat" means in this market.

---

## 3/ For Founders Building on Top of LLMs

### "What does a healthy product architecture look like?"

Every agent company will need **at least two models**:
- Premium for quality
- Overflow for cost cap

It's a category requirement on the way from working product to working business.

### "How cheap can this get?"

- Cost of running one persistent agent that knows a human completely: **$13/month**
- On a lighter model: **$3/month**
- At what point does this become a utility?
- At what depth of memory does switching cost become infinite — when the agent knows your health, your business, your Tuesday?

---

## Key Numbers

| Metric | Value |
|--------|-------|
| Agents deployed | 20,000 |
| Flat price | $49/month |
| Users organically profitable | 47% |
| Top 15% users share of compute | 64% |
| Compute spent on context rebuild | 49% |
| Cache hit rate (messages 2-50) | 97% |
| Margin on flagship model | 58% |
| Margin after model swap (Gemini 3.1 Pro) | 92% |
| Margin projection in 12 months (no price change) | 89% |
| Cost per persistent agent (premium model) | $13/month |
| Cost per persistent agent (lighter model) | $3/month |
| Compute cost reduction rate | ~50% every 6 months |

---

## Implications for Sunder

### Direct parallels:
- Sunder is a persistent agent that "knows" advisory sales professionals — same pattern as Portal One+
- Our cost structure will be similarly front-loaded (context rebuild at session start)
- **97% cache hit rate is achievable** if the prefix is stable (system prompt + tools + memory)
- Model swapping is viable — users pay for memory + orchestration, not the model

### Architecture takeaways:
1. **KV-caching is the #1 cost lever** — everything else is secondary
2. **Price per session, not per message** — the marginal cost of messages 2-50 is near zero
3. **Two-tier model routing is a category requirement** — premium + overflow
4. **Memory is the moat** — switching cost increases with depth of personalization
5. **Don't over-optimize margins now** — compute halves every 6 months; invest in distribution
