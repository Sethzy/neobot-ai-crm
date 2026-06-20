# search_triggers

```json
{
  "name": "search_triggers",
  "description": "Search for available triggers by keywords.\nReturns a list of trigger types that match the search criteria, along with their setup schemas and any prerequisites.\n\nUse this tool to discover what triggers are available before setting one up.\n\nThe setupSchema field of each returned trigger describes the schema of the params object that should\nbe passed into the setup_trigger tool.\n\nTriggers that support editing will include an editSchema field describing the parameters for the edit action in manage_active_triggers.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["keywords"],
    "additionalProperties": false,
    "properties": {
      "keywords": {
        "type": "array",
        "description": "One or more keywords to search for available triggers (e.g., [\"email\", \"schedule\"])",
        "items": {
          "type": "string"
        }
      }
    }
  }
}
```
