# The Agent Improvement Loop Starts with a Trace

> Source: https://www.langchain.com/conceptual-guides/traces-start-agent-improvement-loop
> Saved: 2026-04-03

## Overview

The agent improvement loop operates on a straightforward principle: collect traces, enrich them with evaluations and human feedback, identify failure patterns, implement targeted changes, and validate before deployment. This cycle repeats, generating progressively better data with each iteration.

## Key Takeaways

- Agents comprise multiple updatable layers: model weights, orchestration code, and context (prompts, instructions, skills). Evidence from traces determines what requires modification.
- Traces originate from diverse sources—staging, test runs, benchmarks, local development, and production. The improvement methodology remains consistent regardless of source.
- The loop demands enriching traces with evaluations and annotations, discovering failure patterns, executing specific improvements, and verifying changes prior to release. Every cycle produces superior data enabling more dependable iteration.
- LangSmith integrates all loop components, from initial traces through CI/CD gates preventing regressions.

## Traces as Foundation Material

As stated in a LangChain blog post: "In software, the code documents the app; in AI, the traces do."

Traditional applications rely on code as the authoritative documentation. Agentic systems differ: code establishes what agents *may* perform, while traces reveal what they *actually* accomplished during specific executions.

A trace encompasses complete agent execution: every LLM invocation, tool usage, retrieval operation, intermediate output, and decision sequence. Raw traces document what occurred; enriched traces—scored by evaluators and annotated by reviewers—indicate necessary actions.

## The Agent Improvement Loop Structure

```
Build & Improve → Observe & Debug → Offline Evals → Deploy → Observe (Production) → Online Evals & Insights → Annotations → [return to Build]
```

### Loop Phases

**1. Build and Improve**
Developers examine negatively-scored traces, filter for recurring failure modes, and inspect trajectories producing poor outcomes. Rather than speculating about fixes, they work backward from observed behavior. Failure patterns emerging from real traces inform code and prompt modifications.

**2. Observe and Debug (Pre-Production)**
Updated agents run in staging environments. Traces confirm intended behavior modifications before formal evaluation.

**3. Offline Evaluations**
Enriched traces convert into reproducible test cases. Recurring failure modes become evaluators; problematic inputs become datasets. Developers execute offline eval suites against updated agents, generating concrete before-and-after comparisons. Successful evaluations join the permanent test suite.

**4. Deploy**
Changes ship; new production traces accumulate, establishing the next cycle's baseline.

**5. Observe (Production)**
Every production agent execution generates traces: inputs, outputs, trajectories, tool calls, token usage, latency. This constitutes raw material for subsequent cycles and truth documentation of actual agent behavior.

**6. Online Evaluations and Insights**
Automated evaluators continuously score production outputs. Insights reports surface usage patterns, failure modes, and edge cases across large trace volumes.

**7. Annotations**
Human reviewers annotate selected traces with ratings, corrections, and comments. Each enrichment layer adds context to behavioral records, building labeled data feeding into subsequent build cycles.

Loop effectiveness compounds because each cycle produces better data. More traces reveal additional failure modes. More examples enable more precise evaluations. Refined evaluations support more reliable iteration.

## Automatic Data Generation from Traces

Two data categories drive agent improvement: automatically generated and human-generated. LangSmith facilitates both.

### Online Evaluators

Online evaluators automatically run on production traces, scoring outputs against configurable quality standards. Configuration options include running on all traces, sampled subsets, or filtered subsets based on specific criteria.

Evaluation methodology varies by assessment type:

**LLM-as-a-judge approaches** assess qualitative dimensions lacking deterministic ground truth. Evaluators examine not just final responses but complete trajectories: tool selection appropriateness, sequence correctness, parameter accuracy, helpfulness, tone, relevance, policy adherence, and factual plausibility.

**Code-based checks** evaluate behaviors with clear correct answers. Schema validation, exact-match conditions, format compliance, business rule adherence, and tool correctness receive deterministic evaluation, typically faster and less expensive than LLM routing.

### Insights and Reports

LangSmith's Insights Agent performs automated clustering across production traces, surfacing usage patterns, failure modes, and edge cases. This differs from traditional monitoring—discovering unanticipated patterns rather than tracking predefined metrics.

Teams might inquire: "What are actual user interactions with this agent?" Insights Agent analyzes thousands of traces, categorizes them by intent, and surfaces top categories including unexpected ones. Applied to low-scoring or negatively-reviewed traces, identical analysis reveals consistent failure points and underlying causes.

## Human Judgment Remains Essential

Automated evaluators and insights demonstrate scalability but cannot replace human expertise.

Certain agent behaviors require domain-specialist assessment. A legal research agent citing plausible-sounding yet inaccurate precedents might deceive LLM judges. A medical information agent offering technically correct but clinically inappropriate guidance passes automated checks. Nuanced domain-specific failures necessitate reviewers understanding genuine "correctness."

This drives annotation queue implementation.

Teams route selected production traces into annotation queues using filters: low automated scores, specific feature areas, traces receiving user thumbs-down feedback. Reviewers observe full context, providing ratings, corrections, comments, and revised outputs.

Four primary annotation queue applications emerge in practice:

**Calibrating online evaluators**: Reviewers label traces to align LLM-as-a-judge scoring. When reviewer and automated evaluator disagreement occurs, labeled examples tune graders until scores reflect human judgment.

**Establishing ground truth for offline datasets**: Reviewers label correct final outputs for traces, becoming expected answers in offline eval suites, enabling future version correctness testing against production inputs.

**Scoring open-ended outputs**: When multiple correct answers exist, reviewers label quality-defining criteria rather than single responses. Structured feedback underlies evaluators addressing nuanced dimensions.

**Natural language annotations**: Reviewers attach freeform comments and corrections to traces, flowing into Insights Agent analysis, surfacing patterns scores alone won't reveal.

Two common reviewer profiles emerge:

**General reviewers** (contractors, annotators, customer success teams) assess surface-level quality signals: helpfulness, accuracy relative to visible information, and appropriate tone.

**Domain experts** (product managers, specialists) judge contextual correctness, including failures automation completely misses.

Human-in-the-loop approaches remain necessary at present.

## Enriched Traces and Building Improvements

Enriched traces form raw material for understanding consistent agent failures.

Patterns across multiple traces prove more actionable than individual examples. Teams recognize agents consistently misinterpret certain query types or repeatedly select incorrect tools in particular contexts.

Pattern-level understanding demands scale, consistent labeling, and real production behavior—impossible through spot-checking individual runs.

Necessary fixes depend on trace-revealed patterns. Wrong tool selection for specific query classes might require updated tool descriptions or routing logic. Mid-task reasoning drift might necessitate constrained system prompts or task decomposition. Factually correct but intention-missing outputs typically indicate prompt-level issues requiring clarity about quality definitions. Sometimes traces expose structural problems: required different tools, new workflows, or human-in-the-loop checkpoints at specific decision points.

Each change rests on specific observed behavior rather than hypothetical failure scenarios. Developers rewrite prompts because they observe exactly which traces failed, failure mechanics, and annotated reasoning.

Offline evaluations subsequently make these changes measurable.

## Converting Production Failures to Offline Evaluations

After identifying necessary fixes, mechanisms confirming actual effectiveness prove essential. Offline evaluations serve this purpose.

Eval datasets should originate from production: real traces, authentic queries, genuine failures.

Eval measurements depend on annotation work outputs. Two distinct approaches exist:

**Ground truth correctness**: When reviewers label correct final outputs, direct correctness testing becomes possible. Refined agents run against datasets with agent output compared to labeled ground truth. Successful fixes improve scores; regressions surface before user impact.

**Criteria-based scoring**: Not all outputs possess single correct answers. For open-ended tasks, reviewers label quality-defining criteria rather than specific responses. Offline evals apply criteria to refined-version outputs, measuring improvement dimensions like relevance, completeness, or tone without exact matching.

Every encoded failure mode should remain permanently in test suites, creating durable documentation of learned agent capabilities and gates preventing future change-introduced regressions.

## Online Plus Offline Evaluations Combined

Online evaluators monitor live behavior continuously, catching quality drift, surfacing emerging failure patterns, and flagging review-worthy traces. They don't, however, validate changes before shipping.

Offline evaluations address this gap. They constitute controlled development experiments on curated datasets, preceding any production change.

Together, they bridge production observation and safe iteration. Online evals identify problems; offline evals verify fix effectiveness.

Every failure mode should remain permanently in test suites, documenting learned agent capabilities and preventing future regressions. All prompt modifications, model updates, workflow changes, or architecture modifications should execute against accumulated eval suites pre-deployment. Continuous identical eval execution comparing scores across versions and configurations transforms improvement loops into measurable processes, demonstrating each iteration produced superior agents rather than merely different ones.

## Coding Agents in the Improvement Loop

Improvement loops increasingly automate, with tracing maintaining centrality.

The LangSmith CLI and Skills provide coding agents expert-level LangSmith data access directly from terminals. LangSmith Skills-equipped Claude Code performance jumped from 17% to 92% on eval sets.

Practically, developers instruct coding agents to retrieve 30-day production traces, isolate thumbs-down feedback traces, identify represented failure patterns, draft evaluations from examples, and propose prompt or code changes. All occurs within single terminal sessions grounded in behavioral data.

Coding agents lacking trace data propose changes from incomplete information, creating reasonable-appearing code-review modifications missing actual failure modes through invisible execution trajectories. Trace-informed coding agents access information senior engineers would employ.

## Tracing as Improvement Loop Cornerstone

Reliable agents don't emerge from isolated trace debugging. They develop through trace-centered improvement loops.

Loops commence with tracing, returning to tracing repeatedly. Every evaluator runs on traces. Every annotation attaches to traces. Every offline dataset builds from traces. Every regression test validates against observed traces. Coding agents proposing next fixes read from traces.

Tracing constitutes not merely debugging tools but primitives enabling entire improvement loops, foundational for all evaluation, human feedback, and systematic improvement derivation.

Loops begin with traces. Subsequent loops commence with returned traces.

## Additional Resources

- "Agent observability powers agent evaluation"
- "You don't know what your agent will do until it's in production"
- LangSmith Docs—"Offline evaluation types"
- LangSmith Docs—"Online evaluation types"
- LangSmith Docs—"Annotation queues"
- LangSmith Docs—"Insights"
