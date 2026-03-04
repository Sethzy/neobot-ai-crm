# delete_connection

```json
{
  "name": "delete_connection",
  "description": "PERMANENTLY DELETES a connection from the user's account. Displays a confirmation UI showing all agents that use this connection before deletion. This destroys the stored credentials and cannot be undone.\n\nWARNING: This is a destructive action. Only use when the user explicitly wants to DELETE the connection itself (e.g., \"delete this connection\", \"remove from my account\").\nDO NOT use this tool if the user wants to remove or deactivate tools from a connection (e.g., \"remove {connection name}\") → use manage_activated_tools_for_connections instead",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["connectionId"],
    "additionalProperties": false,
    "properties": {
      "connectionId": {
        "type": "string",
        "description": "The connectionId to delete. Must be a valid connectionId from the user's existing connections."
      }
    }
  }
}
```
