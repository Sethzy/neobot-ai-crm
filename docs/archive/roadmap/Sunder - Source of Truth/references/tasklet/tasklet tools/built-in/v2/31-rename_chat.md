# rename_chat

```json
{
  "name": "rename_chat",
  "description": "Renames the chat. Titles should be a concise 3-5 word summary that captures the goal and key tools. If the user requests a specific name, use that name.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["new_title"],
    "additionalProperties": false,
    "properties": {
      "new_title": {
        "type": "string",
        "description": "The new title for the chat."
      }
    }
  }
}
```
