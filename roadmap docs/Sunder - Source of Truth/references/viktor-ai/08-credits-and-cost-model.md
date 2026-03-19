# Viktor Credits & Cost Model

Source: Direct Q&A with Viktor instance (2026-03-16)

## Credits ≈ LLM Token Cost

"One credit ≈ a small fraction of a cent of AI model cost."

**Primary cost driver: LLM tokens.** Sandbox compute and integration API calls are essentially free. You're paying for Viktor's thinking.

## What Makes Things Expensive

| Activity | Why |
|---|---|
| Long conversations | Context accumulates — each message re-sends everything |
| Crons | Recurring tasks are the biggest credit consumers (runs add up) |
| Image generation | Relatively expensive per call |
| Browser automation | Credits per navigation step (each step needs LLM reasoning) |

## Cost Levers

| Strategy | Effect |
|---|---|
| Use Sonnet for routine crons | Cheaper model for non-complex work |
| Use Gemini Flash for simple high-volume tasks | Even cheaper for simple work |
| Use script crons (no LLM) for deterministic work | Zero LLM cost |
| Start new threads for new topics | Avoids context accumulation in long threads |

**Note:** Viktor confirmed it supports **model routing** at the task level — Sonnet for routine work, Gemini Flash for simple tasks. This suggests the platform does support multi-model, even though Viktor initially said it "experiences the world as one continuous reasoning process."

## Pricing Tiers

| Plan | Credits | $/month | Effective discount |
|---|---|---|---|
| Entry | 20K | $50 | — |
| Top tier | 2.4M | $5,000 | ~16.7% volume discount |

## Implications for Sunder

1. **Credits = tokens is simple billing.** Sunder's message quota system is simpler (flat count), but token-based billing could be more fair for variable-complexity tasks.
2. **Crons are the biggest cost driver.** Sunder's autopilot/pulse runs face the same challenge — recurring LLM calls add up. Script crons (no LLM) for deterministic checks is a smart pattern.
3. **Model routing per task** — Viktor uses cheaper models for routine work. Sunder's current single-model (Gemini Flash) approach is already cost-optimized, but multi-model routing could save further on simple tasks (e.g., Haiku for title generation).
