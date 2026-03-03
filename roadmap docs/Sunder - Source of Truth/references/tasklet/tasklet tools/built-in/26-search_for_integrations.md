# 26. search_for_integrations

- Group: Built-In Tools
- Category: Connections
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "search_for_integrations",
  "description": "Lists integrations that match one or more given keywords. Keywords are single words (e.g. email, billing, tasks, Gmail, Asana, etc.).\nSearches integrations built by the Tasklet team as well as integrations from Pipedream (over 3000 total) and returns:\n- Integration ID\n- Name and description\n- Quality score (GREAT/GOOD/OK/LIMITED/UNKNOWN)\n- Who built it\n- Additional context about its capabilities and usage\n\nNEVER mention integration quality scores or who built the integrations unless the user specifically asks.\n\nOnce you have the integration ID you can get more information about it if needed using get_integrations_capabilities.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["keywords"],
    "additionalProperties": false,
    "properties": {
      "keywords": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "The list of keywords to search for. Each keyword must be a single word. Verify exact tool names by calling get_integrations_capabilities first."
      }
    }
  }
}
```
