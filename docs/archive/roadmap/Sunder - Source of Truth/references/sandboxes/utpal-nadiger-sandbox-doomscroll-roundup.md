# Sandbox Infra Doomscroll Roundup — Utpal Nadiger

_Source:_ https://x.com/utpalnadiger/status/2033370292945658185
_Author:_ Utpal Nadiger (@utpalnadiger) — founder of OpenComputer (opencomputer.dev)
_Date:_ 2026-03-16

---

## Context

Utpal put himself in the shoes of a user going from "I want to build an agent" to "here's the infra I want to use" and catalogued every useful resource he found along the way. He's upfront that he's a vendor in the space (opencomputer.dev) so there's inherent bias, but the curation is solid.

## Key Resources Mentioned

### 1. Awesome Sandbox Repo
Breaks down the main isolation approaches: MicroVMs, application kernels, language runtimes, containers. Maps which vendors use what. Good for building a mental model before comparing.

### 2. "A Thousand Ways to Sandbox an Agent" (or similar long-form article)
Utpal calls it "an absolute work of art" — likely written with Opus. Comprehensive breakdown of sandbox approaches. (May already be captured in our existing reference: `a-thousand-ways-to-sandbox-an-agent.md`.)

### 3. Compute SDK Benchmarks
Thorough, open-source benchmark repo from a sandbox "gateway" company. Utpal argues they aren't incentivized to be partial to any one vendor. Recommends running them yourself.

### 4. Community Comparisons

| Who | Handle | What |
|-----|--------|------|
| Mert (founder of banker.so) | @gm_mertd | Feature-by-feature comparison beyond just benchmarks |
| Nilesh Agarwal (ex-CTO Inferless, now Baseten) | @nilesh_agarwal2 | Deep benchmark analysis — strong infra background |
| Kajogo (founder of stakpak.dev) | @kajogo777 | Taxonomy of sandbox types — helps figure out what you need before comparing |
| Nathan Flurry (creator of sandboxagent.dev, founder of Rivet) | @NathanFlurry | Cost comparison across providers (self-noted accuracy caveats) |
| Ryan Vogel | @ryanvogel | Thread that "comes up on almost every user call" — basically required reading in the space |

## Takeaway

Good meta-resource for anyone evaluating sandbox infra. The awesome-sandbox repo + compute SDK benchmarks are the two most actionable starting points. The community threads add color on cost, features, and taxonomy.
