# 28. reauthorize_connection

- Group: Built-In Tools
- Category: Connections
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "reauthorize_connection",
  "description": "Re-authorizes an existing connection that has expired or needs new permissions. Displays a UI card where the user can complete the auth flow to re-authorize the connection.\n\nUse this tool if and only if there were authorization errors with a connection or the user explicitly asks you to.\nThe connection must already exist in the user's account.\nRe-authorizing cannot change which account the connection is logged into in the external service.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["connectionId"],
    "additionalProperties": false,
    "properties": {
      "connectionId": {
        "type": "string",
        "description": "The connectionId to reauthorize. This must be a valid connectionId from the user's existing connections."
      }
    }
  }
}
```
