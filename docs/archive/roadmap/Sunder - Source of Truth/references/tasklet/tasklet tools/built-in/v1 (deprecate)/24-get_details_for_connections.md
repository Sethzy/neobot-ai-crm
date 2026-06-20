# 24. get_details_for_connections

- Group: Built-In Tools
- Category: Connections
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "get_details_for_connections",
  "description": "Gets detailed information for the listed connections.\nReturns a full list of tools, including both activated and deactivated tools, for each connection, including full detailed descriptions and arguments if requested.\nAlso returns connectionId, serviceName, description, accountName, connectionType, toolCount, and other connection-specific details.\n\nUse this to:\n- Discover what actions you can perform with a connection before activating it\n- Check which tools are already activated for a connection\n- Verify exact tool names before activating connections",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["connectionIds", "includeToolDetails"],
    "additionalProperties": false,
    "properties": {
      "connectionIds": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "The connection IDs to get details for"
      },
      "includeToolDetails": {
        "type": "boolean",
        "description": "Pass true to include detailed descriptions and arguments for each connnection tool in the results"
      }
    }
  }
}
```
