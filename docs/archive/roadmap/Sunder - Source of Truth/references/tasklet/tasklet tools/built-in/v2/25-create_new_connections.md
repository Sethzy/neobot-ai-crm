# create_new_connections

```json
{
  "name": "create_new_connections",
  "description": "Creates new connections to external services.\nDisplays a UI card where the user can choose to create each connection or skip it.\nCreating a connection will authenticate the user to the service and then save the connection to the user's account so they can use it in other agents in the future.\n\nIMPORTANT: You MUST read /agent/skills/system/creating-connections/SKILL.md for detailed setup instructions before using this tool.\n\nSupports the creation of 4 different types of connections: pre-built integrations, custom MCP, Direct API (HTTP) and Computer Use.\nFor pre-built integrations supports the creation of multiple connections at once. All others support only one connection creation at a time.\n\nFor each connection creation request returns:\n- userAction: 'created' if user authorized, 'skipped' if user declined.\n\nIf successfully created, also returns:\n- connectionId: the new connection ID. Don't mention the connectionId to the user.\n- tools: { activated: string[], deactivated: string[] } - list of all connection tool names by activation state\n- connection-specific details",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["connection"],
    "additionalProperties": false,
    "properties": {
      "connection": {
        "anyOf": [
          {
            "type": "object",
            "required": ["type", "integrations"],
            "additionalProperties": false,
            "properties": {
              "type": {
                "type": "string",
                "const": "integrations",
                "description": "Create connections from pre-built integrations"
              },
              "integrations": {
                "type": "array",
                "description": "The list of integrations to create connections for.",
                "items": {
                  "type": "object",
                  "required": ["integrationId"],
                  "additionalProperties": false,
                  "properties": {
                    "integrationId": {
                      "type": "string",
                      "description": "The integration id"
                    },
                    "toolsToActivate": {
                      "type": "array",
                      "description": "The list of tools to activate once the connection is created.",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "required": ["type"],
            "additionalProperties": false,
            "properties": {
              "type": {
                "type": "string",
                "const": "mcp",
                "description": "Create a connection to an MCP server"
              },
              "displayName": {
                "type": "string",
                "description": "A short human-readable display name for the MCP server"
              },
              "serverUrl": {
                "type": "string",
                "description": "The URL of the MCP server to connect to. Must have the https:// prefix. The user can edit or even completely rewrite the value during the setup."
              }
            }
          },
          {
            "type": "object",
            "required": ["type", "serviceName", "description", "connectionName", "baseUrl", "methods", "authConfig", "notes"],
            "additionalProperties": false,
            "properties": {
              "type": {
                "type": "string",
                "const": "direct_api",
                "description": "Create a custom HTTP API connection"
              },
              "serviceName": {
                "type": "string",
                "description": "Name of the remote service (e.g., \"OpenAI API\", \"Stripe\")"
              },
              "description": {
                "type": "string",
                "description": "Clear description of what this service does"
              },
              "connectionName": {
                "type": "string",
                "minLength": 1,
                "maxLength": 32,
                "description": "Human-readable name (1-32 chars)"
              },
              "baseUrl": {
                "type": "string",
                "description": "The base URL of the API. Be extremely careful to find the correct base URL for the API."
              },
              "methods": {
                "type": "array",
                "minItems": 1,
                "description": "HTTP methods to allow",
                "items": {
                  "type": "string",
                  "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]
                }
              },
              "authConfig": {
                "type": "object",
                "additionalProperties": {},
                "description": "Authentication config object. Read /agent/skills/system/creating-connections/create-direct-api-connection.md for schema.",
                "propertyNames": {
                  "type": "string"
                }
              },
              "notes": {
                "type": "string",
                "description": "Markdown notes for this connection"
              },
              "testCases": {
                "type": "array",
                "maxItems": 3,
                "description": "Test cases to verify the API connection works. See skill file for schema.",
                "items": {
                  "type": "object",
                  "additionalProperties": {},
                  "propertyNames": {
                    "type": "string"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "required": ["type", "displayName"],
            "additionalProperties": false,
            "properties": {
              "type": {
                "type": "string",
                "const": "computer_use",
                "description": "Provision a remote computer for browser or desktop UI use. This is expensive and slow."
              },
              "displayName": {
                "type": "string",
                "description": "A clear, purposeful display name for this computer (e.g., \"Development Computer\", \"Testing Computer\")."
              }
            }
          }
        ],
        "description": "The connection configuration. Use the 'type' field to specify the connection type."
      }
    }
  }
}
```
