# 16. setup_trigger

- Group: Built-In Tools
- Category: Triggers
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "setup_trigger",
  "description": "Set up a new trigger instance. First use search_triggers to find available triggers\nand their setup schemas, then call this tool with the trigger ID and required parameters.\nOn completion, shows the user a UI card with the trigger details.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["trigger_id", "params"],
    "additionalProperties": false,
    "properties": {
      "trigger_id": {
        "type": "string",
        "description": "The ID of the trigger type to set up (e.g., \"schedule\", \"webhook\", \"gmail\", \"rss\")"
      },
      "params": {
        "type": "object",
        "additionalProperties": {},
        "propertyNames": {
          "type": "string"
        },
        "description": "Setup parameters as defined by the trigger's setupSchema"
      }
    }
  }
}
```
