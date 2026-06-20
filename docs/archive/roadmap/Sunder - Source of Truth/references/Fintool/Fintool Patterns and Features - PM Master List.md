# Fintool Patterns and Features - PM Master List

## Why this file exists
This is a complete plain-language list of the product and operating patterns shared across the Fintool materials in this folder.

For each pattern, this file explains:
1. What it is
2. What implementing it would achieve

---

## A) Product Experience Patterns

1. **Chat is the main product surface**
What it is: Users ask in one chat instead of clicking many tabs.
What this achieves: Faster onboarding, less confusion, and much faster feature rollout because new capabilities show up in chat immediately.
Source: `donovanso-fintool-chat-only-hyper-personalized-FULL.md`

2. **"Just ask" feature discovery**
What it is: Users do not need to know where features live; they ask naturally.
What this achieves: Better adoption of features that would otherwise stay hidden.
Source: `donovanso-fintool-chat-only-hyper-personalized-FULL.md`

3. **Hyper-personalized responses by default**
What it is: The assistant uses each user's own context (watchlists, preferences, past work).
What this achieves: More relevant outputs and stronger retention because the assistant feels tailored.
Source: `donovanso-fintool-chat-only-hyper-personalized-FULL.md`

4. **Structured questions during tasks**
What it is: The assistant can pause and ask clear multiple-choice or form-like questions mid-task.
What this achieves: Better quality output with less back-and-forth confusion.
Source: `donovanso-fintool-chat-only-hyper-personalized-FULL.md`, `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

5. **Rich results directly in chat**
What it is: Chat can render tables, charts, formulas, files, and document previews.
What this achieves: Users can review outcomes without leaving chat.
Source: `donovanso-fintool-chat-only-hyper-personalized-FULL.md`

6. **Chat-first onboarding**
What it is: Onboarding happens through guided conversation instead of a long setup form.
What this achieves: Lower activation drop-off and faster first value.
Source: `ishanxnagpal-ai-agent-fde-forward-deployed-engineer-FULL.md`, `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

---

## B) Learning and Personalization Loops

7. **Learning loop (remember user style)**
What it is: Capture user preferences once and reuse every session.
What this achieves: The assistant stops asking repeated setup questions and feels "stateful."
Source: `ishanxnagpal-ai-agent-fde-forward-deployed-engineer-FULL.md`

8. **Automation loop (detect repeated work)**
What it is: A scheduled review of past conversations to find repeated workflows.
What this achieves: The assistant proactively suggests automation opportunities.
Source: `ishanxnagpal-ai-agent-fde-forward-deployed-engineer-FULL.md`

9. **Outreach loop (re-engage inactive users)**
What it is: If a user goes quiet, the assistant sends relevant updates based on their interests.
What this achieves: Better retention and reactivation without spam.
Source: `ishanxnagpal-ai-agent-fde-forward-deployed-engineer-FULL.md`

10. **Weekly proactive skill suggestions**
What it is: A weekly run that proposes reusable workflows the user should save.
What this achieves: The product keeps getting better for each user over time.
Source: `ishanxnagpal-ai-agent-fde-forward-deployed-engineer-FULL.md`

11. **Skills that compound over time**
What it is: User-specific instructions accumulate as reusable building blocks.
What this achieves: Faster execution and higher quality for repeated tasks.
Source: `ishanxnagpal-ai-agent-fde-forward-deployed-engineer-FULL.md`

12. **Thesis files that evolve with evidence**
What it is: Living files where assumptions and evidence get updated as new information arrives.
What this achieves: Better continuity in reasoning and less context loss.
Source: `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

13. **Drift detection on key assumptions**
What it is: The assistant checks whether new information weakens prior assumptions.
What this achieves: Early warning when strategy should change.
Source: `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

14. **Dynamic screens that update automatically**
What it is: Saved criteria lists that auto-refresh as new events arrive.
What this achieves: Continuous opportunity discovery without manual re-screening.
Source: `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

15. **Permission-based deep onboarding**
What it is: With user approval, the assistant learns from real artifacts (notes, models, docs).
What this achieves: Better personalization than simple preference forms.
Source: `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

---

## C) Skills and Workflow Authoring Patterns

16. **Skills as plain-language instruction files**
What it is: Workflows are captured in readable text files.
What this achieves: Domain experts can improve behavior without writing application code.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

17. **Non-engineers can author workflows**
What it is: Analysts and users can create and edit methods directly.
What this achieves: Faster iteration and less engineering bottleneck.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`, `nicolasbustamante-10-years-vertical-software-selloff-FULL.md`

18. **No release cycle needed for workflow updates**
What it is: Updating instructions takes effect immediately.
What this achieves: Faster improvements and easier experimentation.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

19. **Skill shadowing (personal overrides team, team overrides default)**
What it is: Personal workflow files can override shared defaults.
What this achieves: One platform can support standardization and customization at the same time.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

20. **Progressive skill loading**
What it is: Load only the instructions needed for the current task.
What this achieves: Lower cost and less model confusion.
Source: `ishanxnagpal-ai-agent-fde-forward-deployed-engineer-FULL.md`, `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

21. **Skill + eval pairing**
What it is: Every important workflow has tests tied to it.
What this achieves: Safer updates with measurable quality.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

22. **Temporary scaffolding mindset**
What it is: Keep workflows for what models cannot yet do; remove scaffolding as models improve.
What this achieves: Less technical debt and faster adaptation.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`, `donovanso-fintool-chat-only-hyper-personalized-FULL.md`

---

## D) Context and Data Architecture Patterns

23. **Context is the product**
What it is: Quality depends less on prompt wording and more on high-quality context access.
What this achieves: Better answers that users trust.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`, `edouardgodfrey-local-ai-agents-context-wins-FULL.md`

24. **Normalize messy input into a few standard formats**
What it is: Convert mixed input into clean narrative files, structured tables, and metadata.
What this achieves: Reliable retrieval and reasoning.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

25. **Different chunking rules by document type**
What it is: Split each type of document in the way that preserves meaning.
What this achieves: Better search hits and fewer wrong answers.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

26. **Treat tables as first-class data**
What it is: Handle tables with dedicated extraction quality checks.
What this achieves: Fewer numeric mistakes in outputs.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

27. **Confidence-gated extraction**
What it is: Low-confidence parsed data is held back for review.
What this achieves: Lower risk of bad data entering core workflows.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

28. **Time-period normalization**
What it is: Normalize ambiguous period references into exact date ranges.
What this achieves: Fewer silent logic mistakes in reporting and analysis.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

29. **File-first user memory**
What it is: Keep user preferences in a simple editable memory file.
What this achieves: Easy personalization without schema migrations.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`, `donovanso-fintool-chat-only-hyper-personalized-FULL.md`

30. **One durable file store as source of truth**
What it is: Write to one durable file layer first, then sync to query storage.
What this achieves: Simpler operations, easier debugging, cleaner data flow.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`, `donovanso-fintool-chat-only-hyper-personalized-FULL.md`

31. **One-way sync plus periodic reconcile**
What it is: Real-time sync for freshness and scheduled reconcile for safety.
What this achieves: Good speed plus data consistency.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

32. **Timestamp-guarded upserts**
What it is: Newer updates always win during sync.
What this achieves: Fewer race-condition errors.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

33. **Optimistic UI on top of async sync**
What it is: Show updates immediately while background sync completes.
What this achieves: Better perceived speed without sacrificing architecture.
Source: `donovanso-fintool-chat-only-hyper-personalized-FULL.md`

34. **Filesystem as shared language for human + agent**
What it is: People and agents can inspect the same files.
What this achieves: Better transparency and easier troubleshooting.
Source: `ishanxnagpal-ai-agent-fde-forward-deployed-engineer-FULL.md`

---

## E) Runtime, Safety, and Execution Patterns

35. **Sandbox is mandatory for tool-using agents**
What it is: Agents run in isolated workspaces, not on core servers.
What this achieves: Prevents catastrophic damage from bad commands.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

36. **Three storage scopes (private/shared/public)**
What it is: Personal, team, and global data are separated by access scope.
What this achieves: Cleaner collaboration and safer multi-tenant behavior.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

37. **Short-lived scoped credentials**
What it is: Access tokens are temporary and restricted to allowed data areas.
What this achieves: Stronger isolation between users.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

38. **Sandbox pre-warm**
What it is: Start the workspace while user is typing.
What this achieves: Lower perceived latency on submit.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

39. **Default-deny access model**
What it is: The agent gets no access unless explicitly shared.
What this achieves: Much lower risk surface.
Source: `edouardgodfrey-local-ai-agents-context-wins-FULL.md`

40. **Controlled mounts (share only what is needed)**
What it is: Mount only specific folders for read/write.
What this achieves: Safer agent operation with practical access.
Source: `edouardgodfrey-local-ai-agents-context-wins-FULL.md`

41. **Risk model with three failure classes**
What it is: Treat destruction, data leakage, and unintended actions as separate risks.
What this achieves: Better security planning and policy design.
Source: `edouardgodfrey-local-ai-agents-context-wins-FULL.md`

42. **Browser as a universal integration layer**
What it is: Use browser control when API connectors are missing.
What this achieves: Works across many real-world tools without waiting on integrations.
Source: `edouardgodfrey-local-ai-agents-context-wins-FULL.md`

43. **Two trigger paths, one core agent**
What it is: Scheduled and event-driven triggers both feed the same assistant runtime.
What this achieves: Less architecture sprawl and easier debugging.
Source: `ishanxnagpal-ai-agent-fde-forward-deployed-engineer-FULL.md`, `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

44. **Durable long-running workflows**
What it is: Long tasks survive worker restarts and retries.
What this achieves: More reliable completion for heavy jobs.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`, `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

45. **Cancellation via heartbeat checks**
What it is: Running tasks check for cancellation frequently.
What this achieves: User "stop" actions actually work in distributed execution.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

46. **Separate worker pools by workload type**
What it is: User-facing tasks and background tasks scale independently.
What this achieves: Better stability under load.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

47. **Idempotence for trigger processing**
What it is: Track already-processed event pairs so reindexing does not re-fire work.
What this achieves: Prevents duplicates and noisy repeats.
Source: `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

48. **Point-in-time snapshots for moving sets**
What it is: Resolve dynamic groups to concrete lists at creation time.
What this achieves: Consistent reproducibility and easier debugging.
Source: `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

49. **Timeliness verification**
What it is: Explicitly check that an alert is truly new information.
What this achieves: Fewer low-value notifications.
Source: `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

50. **Self-configuring schedules**
What it is: A workflow can update its own next execution time based on outcomes.
What this achieves: Less waste and more relevant runs.
Source: `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

---

## F) Alerting and Proactive Intelligence Patterns

51. **Separate broad matching from deep interpretation**
What it is: Use broad filters first, then semantic analysis.
What this achieves: Good coverage without overwhelming users.
Source: `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

52. **Discovery-before-configuration alert setup**
What it is: Explore where signals appear before finalizing trigger settings.
What this achieves: Better defaults and fewer missed events.
Source: `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

53. **Ask clarifying questions with concrete options**
What it is: Use clear answer options instead of vague open questions.
What this achieves: Faster setup and fewer wrong assumptions.
Source: `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

54. **Coverage-first matching policy**
What it is: Prefer false positives over missed critical events.
What this achieves: Lower risk of missing important changes.
Source: `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

55. **Conditional scheduled checks**
What it is: Scheduled workflows can run only when extra conditions are true.
What this achieves: Better relevance and lower run cost.
Source: `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

56. **User-owned alert prompts**
What it is: Users define the analysis instructions for their alerts.
What this achieves: High flexibility without hardcoded event templates.
Source: `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

57. **Complexity tiers for alerting**
What it is: Support simple filters, thesis monitoring, and proactive screening as separate levels.
What this achieves: Controlled rollout from easy wins to advanced intelligence.
Source: `jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md`

---

## G) Quality, Evaluation, and Monitoring Patterns

58. **Domain-specific evaluation suites**
What it is: Test sets designed around real domain failure modes, not generic language metrics.
What this achieves: More trustworthy production quality.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

59. **Adversarial grounding tests**
What it is: Deliberately inject wrong signals and verify the assistant still grounds correctly.
What this achieves: Better hallucination resistance.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

60. **Quality gates in development workflow**
What it is: Block changes when quality score drops past threshold.
What this achieves: Prevents silent regression in core workflows.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

61. **Trace-first observability**
What it is: Keep full traces across model, workflow, and infrastructure layers.
What this achieves: Faster root-cause analysis when things fail.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`, `vercel-testing-bash-is-all-you-need-FULL.md`

62. **Auto-issue creation from production failures**
What it is: Failures automatically create actionable engineering tickets with full context.
What this achieves: Faster fix cycles and less manual triage.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

63. **Cost-aware model routing**
What it is: Route simple work to cheaper models and complex work to stronger models.
What this achieves: Better unit economics without blanket quality loss.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

64. **Streaming by small deltas, not full replays**
What it is: Send only incremental updates to UI.
What this achieves: Lower latency and lower transport overhead.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

65. **Open eval harness and repeatable benchmarks**
What it is: Keep benchmark process reproducible and transparent.
What this achieves: Better decision-making on architecture changes.
Source: `vercel-testing-bash-is-all-you-need-FULL.md`

66. **Iterative benchmark correction process**
What it is: Fix benchmark bugs and ambiguous scoring over time.
What this achieves: Avoids optimizing against broken tests.
Source: `vercel-testing-bash-is-all-you-need-FULL.md`

67. **Task-specific tool strategy (SQL vs file exploration vs hybrid)**
What it is: Choose tools based on data shape and quality risk.
What this achieves: Better balance between speed, cost, and accuracy.
Source: `vercel-testing-bash-is-all-you-need-FULL.md`

68. **Self-verification for high-stakes work**
What it is: Cross-check outputs using two different methods before final answer.
What this achieves: Higher confidence and fewer expensive mistakes.
Source: `vercel-testing-bash-is-all-you-need-FULL.md`

---

## H) Growth and Distribution Patterns

69. **Agent-run content engine using same runtime**
What it is: Use the same skill/trigger architecture for growth content generation.
What this achieves: Scalable inbound with little manual content effort.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`, `ishanxnagpal-ai-agent-fde-forward-deployed-engineer-FULL.md`

70. **Triggered publishing workflows**
What it is: Content generation runs when relevant events happen (news, filings, earnings).
What this achieves: Timely content and better discoverability.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

71. **Human + model readable content structure**
What it is: Publish in formats that rank and are easy for AI systems to cite.
What this achieves: Better AI-referral and search performance.
Source: `nicbustamante-fintool-lessons-building-ai-agents-FULL.md`

---

## I) Strategy Patterns (What to build, when to build)

72. **Model-Market Fit gate before scaling product bets**
What it is: Confirm the model can reliably do the core paid job before heavy product scaling.
What this achieves: Avoids building polished workflows on top of weak core capability.
Source: `nicolasbustamante-model-market-fit-FULL.md`

73. **Human-in-loop diagnostic**
What it is: Check whether humans are reviewing quality or compensating for model weakness.
What this achieves: Honest readiness assessment for automation.
Source: `nicolasbustamante-model-market-fit-FULL.md`

74. **80/99 quality gap framing**
What it is: In high-stakes domains, "pretty good" may still be unusable.
What this achieves: Sets realistic quality bar before launch.
Source: `nicolasbustamante-model-market-fit-FULL.md`

75. **Agentic threshold framing**
What it is: Plan for multi-day autonomous work, not just short one-shot tasks.
What this achieves: Better long-term architecture for real workflows.
Source: `nicolasbustamante-model-market-fit-FULL.md`

76. **Timing matrix for build decisions**
What it is: Decide whether to build now, build early, or wait based on capability horizon.
What this achieves: Better capital allocation and reduced "wait and burn" risk.
Source: `nicolasbustamante-model-market-fit-FULL.md`

77. **Data moat focus over interface moat**
What it is: Treat proprietary data as the durable advantage; assume interface advantage decays.
What this achieves: Better long-term defensibility planning.
Source: `nicolasbustamante-crumbling-workflow-moat-FULL.md`, `nicolasbustamante-10-years-vertical-software-selloff-FULL.md`

78. **Headless supplier / API-first future assumption**
What it is: Assume users interact through assistant layers while supplier systems become invisible backends.
What this achieves: Better product strategy in a chat-first market.
Source: `nicolasbustamante-crumbling-workflow-moat-FULL.md`

79. **Moat stress-test framework**
What it is: Test your business on data uniqueness, regulatory lock-in, and transaction embedding.
What this achieves: Clearer risk map for product and GTM decisions.
Source: `nicolasbustamante-10-years-vertical-software-selloff-FULL.md`

80. **Pincer-risk model**
What it is: Plan for pressure from both AI-native startups and horizontal platforms going vertical.
What this achieves: More realistic competitive strategy.
Source: `nicolasbustamante-10-years-vertical-software-selloff-FULL.md`

---

## Practical summary for PMs
If you implement the full set above, you get a product that:
1. Feels simple to users (one chat surface).
2. Gets better with each customer over time (learning + compounding skills).
3. Is safer and more reliable in production (sandboxing, idempotence, durable workflows, tests).
4. Balances cost and quality with explicit policies (model routing, self-verification for high-stakes tasks).
5. Builds a stronger moat through context and proprietary signal accumulation, not UI complexity.

