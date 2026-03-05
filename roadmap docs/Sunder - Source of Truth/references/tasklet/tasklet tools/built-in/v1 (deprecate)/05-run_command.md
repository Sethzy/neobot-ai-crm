# 5. run_command

- Group: Built-In Tools
- Category: Sandbox
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "run_command",
  "description": "Executes shell commands in the sandbox environment.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["command", "action_pending", "action_finished", "action_error"],
    "additionalProperties": false,
    "properties": {
      "command": {
        "type": "string",
        "description": "The shell command to execute in the sandbox environment."
      },
      "timeout": {
        "type": "number",
        "maximum": 300,
        "description": "Timeout in seconds for the command. Defaults to 60 seconds."
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
