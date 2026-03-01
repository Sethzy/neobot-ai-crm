# 27. manage_activated_tools_for_connections

- Group: Built-In Tools
- Category: Connections
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "manage_activated_tools_for_connections",
  "description": "Activates or deactivates tools for connections.\nChanging activation status of tools requires the user to approve the permission changes, so a UI card will be displayed to the user where they can approve or reject the changes.\nThe tool will return after the user approves or rejects the permission changes.\n\nReturns an array of objects for each connection:\n- connectionId: the connection ID\n- userAction: 'approved' if user approved the changes, 'skipped' if user rejected\n- tools: { activated: string[], deactivated: string[] } - lists of tool names currently activated/deactivated for the connection\n- skills: (optional) instructions to read the skills file for this connection.\n\nActivated tools will then become available to use and will appear in your tool context with the tool name prefixed by the connection ID.\nYou MUST always verify exact tool names before activating them. Use get_details_for_connections to see tool names and descriptions for a connection. Never guess a tool name.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["connections"],
    "additionalProperties": false,
    "properties": {
      "connections": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["connectionId", "activate", "deactivate"],
          "additionalProperties": false,
          "properties": {
            "connectionId": {
              "type": "string",
              "description": "The connectionId to activate or deactivate tools for. Must be a valid connectionId from the user's existing connections."
            },
            "activate": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "Tool names to activate from this connection. Always verify exact tool names before activating them."
            },
            "deactivate": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "Tool names to deactivate from this connection."
            }
          }
        }
      }
    }
  }
}
```
