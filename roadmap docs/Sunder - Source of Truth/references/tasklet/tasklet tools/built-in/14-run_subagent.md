# 14. run_subagent

- Group: Built-In Tools
- Category: Subagents
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "run_subagent",
  "description": "Runs a subagent to handle work efficiently outside of your main context. Returns the final message from the subagent as its result.\nRunning subagents reduces costs and keeps your context focused. This is especially useful when you are doing similar work multiple times.\n\nThe subagent receives the content of the markdown file followed by any payload data you provide in the first user message.\n\nBefore running a subagent, consider whether the subagent's approach still fits the current situation - you can always update its file with write_file if needed.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["path", "action_pending", "action_finished", "action_error"],
    "additionalProperties": false,
    "properties": {
      "path": {
        "type": "string",
        "description": "Full path to the subagent markdown file (e.g., \"/agent/subagents/email_processor.md\")"
      },
      "payload": {
        "type": "string",
        "description": "Optional data to pass to the subagent that will be added after the subagent's instructions in the first user message. This allows the same subagent to process different inputs."
      },
      "action_pending": {
        "type": "string",
        "description": "Custom UI status text shown while running. IMPORTANT: Output these three action_ parameters before all other parameters."
      },
      "action_finished": {
        "type": "string",
        "description": "Custom UI status text shown on success."
      },
      "action_error": {
        "type": "string",
        "description": "Custom UI status text shown on failure."
      }
    }
  }
}
```
