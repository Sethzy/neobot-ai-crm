# 13. list_tasks

- Group: Built-In Tools
- Category: Tasks
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "list_tasks",
  "description": "List tasks for this agent. Can optionally filter by specific task IDs.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "taskIds": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Optional array of task IDs to filter. If not provided, returns all tasks."
      }
    }
  }
}
```
