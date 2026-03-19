# Tool Evaluation Cookbook

> Source: https://platform.claude.com/cookbook/tool-evaluation-tool-evaluation
> Published: September 10, 2025

Run parallel agent evaluations on tools independently from evaluation task files. Multiple agents independently run a single evaluation task from an evaluation file.

## Architecture

The cookbook demonstrates an end-to-end tool evaluation pipeline with these components:

### 1. Evaluation Prompt (System Prompt for Eval Agents)

Agents are instructed to:
- Use available tools to complete the task
- Provide a `<summary>` of steps, tools used, inputs/outputs, and reasoning
- Provide `<feedback>` on tool names, parameters, descriptions, errors, and improvement suggestions
- Provide a `<response>` with the final answer (concise, directly addressing the task)
- Return `<response>NOT_FOUND</response>` if the task cannot be solved

### 2. Agent Loop

A simple agentic loop that:
1. Sends the task prompt with tools to Claude
2. Handles tool calls in a while-loop (alternating LLM API calls and tool execution)
3. Tracks tool metrics: call counts and durations per tool
4. Returns the full response text and tool metrics

```python
def agent_loop(prompt, tools) -> (response_text, tool_metrics):
    # tool_metrics = {tool_name: {"count": N, "durations": [X1, X2, ...]}}
```

### 3. Evaluation File Format (XML)

Tasks are defined in XML with prompt/response pairs:

```xml
<evaluations>
  <task>
    <prompt>Calculate the compound interest on $10,000...</prompt>
    <response>11614.72</response>
  </task>
  <!-- more tasks -->
</evaluations>
```

### 4. Task Evaluation

Each task produces:
- `prompt` — the input task
- `expected` — ground truth response
- `actual` — agent's extracted `<response>` content
- `score` — 1 if exact match, 0 otherwise
- `total_duration` — wall clock time
- `tool_calls` — per-tool call counts and durations
- `num_tool_calls` — total tool calls
- `summary` — agent's reasoning/steps
- `feedback` — agent's feedback on tool quality

### 5. Report Generation

The evaluation report includes:
- **Summary**: accuracy (correct/total), average task duration, average tool calls per task, total tool calls
- **Per-task detail**: prompt, ground truth, actual response, correct/incorrect indicator, duration, tool call metrics, agent summary, agent feedback

## Key Patterns from the Calculator Example

The cookbook uses a deliberately under-documented calculator tool to demonstrate how poor tool descriptions degrade performance:

```python
calculator_tool = {
    "name": "calculator",
    "description": "",          # Empty description
    "input_schema": {
        "type": "object",
        "properties": {
            "expression": {
                "type": "string",
                "description": "",  # Empty parameter description
            }
        },
        "required": ["expression"],
    },
}
```

### Results: 7/8 tasks correct (87.5%)

The one failure was a **format mismatch** — the agent returned `$11,614.72` instead of `11614.72`. This highlights:
- Verifiers should not be overly strict (reject correct answers due to formatting differences)
- Tool descriptions should clarify expected output formats

### Common Agent Feedback (from eval transcripts)

Agents consistently identified these issues with the under-documented calculator:
1. **No description** — agents didn't know what syntax was supported
2. **No parameter documentation** — agents had to discover `**` vs `^` through trial and error
3. **Missing math functions** — `sqrt()`, `sin()`, `cos()`, `log()`, `round()` not available
4. **Unhelpful errors** — error messages didn't suggest alternatives
5. **Excessive tool calls** — average 7.75 calls per task due to trial-and-error discovery

### Improvement Opportunities Identified

- Add clear description of supported operations and syntax
- Document that Python `**` is used for exponentiation (not `^`)
- Support common math functions or document their absence
- Provide example expressions in the description
- Add a `precision` parameter for rounding
- Return more helpful error messages with suggested corrections

## How to Apply This Pattern

1. **Define your tools** with schemas (can start with minimal descriptions to baseline)
2. **Write evaluation tasks** as XML prompt/response pairs grounded in real workflows
3. **Run the evaluation** — each task gets its own agent loop
4. **Read the report** — check accuracy, duration, tool call counts
5. **Read agent feedback** — agents are surprisingly good at identifying tool UX issues
6. **Improve tool descriptions and implementations** based on findings
7. **Re-run and compare** — iterate until performance plateaus
8. **Use a held-out test set** to ensure improvements generalize
