# 25. get_integrations_capabilities

- Group: Built-In Tools
- Category: Connections
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "get_integrations_capabilities",
  "description": "Lists the capabilities available via the given integrations, including tools (if available), quality information (GREAT, GOOD, OK, LIMITED, and UNKNOWN), and notes.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["integrationIds"],
    "additionalProperties": false,
    "properties": {
      "integrationIds": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "The list of integration IDs to get capabilities for."
      }
    }
  }
}
```
