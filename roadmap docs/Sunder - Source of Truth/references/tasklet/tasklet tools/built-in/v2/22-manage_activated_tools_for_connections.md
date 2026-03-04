# manage_activated_tools_for_connections

```json
{
  "name": "manage_activated_tools_for_connections",
  "description": "Activates or deactivates tools for connections.\nChanging activation status of tools requires the user to approve the permission changes, so a UI card will be displayed to the user where they can approve or reject the changes.\nThe tool will return after the user approves or rejects the permission changes.\n\nReturns an array of objects for each connection:\n- connectionId: the connection ID\n- userAction: 'approved' if user approved the changes, 'skipped' if user rejected\n- tools: { activated: string[], deactivated: string[] } - lists of tool names currently activated/deactivated for the connection\n- skills: (optional) instructions to read the skills file for this connection.\n\nActivated tools will then become available to use and will appear in your tool context with the tool name prefixed by the connection ID. For example, the search_for_info tool on connection Id conn_1234 will appear as conn_1234__search_for_info in your prompt. If you don't see the tool you need try activating it first.\nTo discover the full set of tools that are available for each connection before activating them call get_details_for_connections.\n\nIf your connection has an associated skills file you MUST read and follow the instructions in the skills file before using any tools from that connection.",
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
              "description": "Tool names to activate from this connection. Always verify exact tool names before activating them.",
              "items": {
                "type": "string"
              }
            },
            "deactivate": {
              "type": "array",
              "description": "Tool names to deactivate from this connection.",
              "items": {
                "type": "string"
              }
            }
          }
        }
      }
    }
  }
}
```
