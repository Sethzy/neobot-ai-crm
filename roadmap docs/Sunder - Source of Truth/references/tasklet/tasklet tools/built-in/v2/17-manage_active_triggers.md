# manage_active_triggers

```json
{
  "name": "manage_active_triggers",
  "description": "Manage the agent's active triggers.\n\nActions:\n- list: Returns all active triggers with their IDs, names, titles, invocationMessage, and arguments.\n- view: Shows detailed information for a specific trigger. Requires trigger_instance_id.\n- delete: Removes an active trigger. Requires trigger_instance_id. This is destructive.\n- simulate: Fires a test event on a trigger to test the agent's response. Requires trigger_instance_id and payload.\n- edit: Modifies an existing trigger's configuration. Requires trigger_instance_id. Use edit_params to modify trigger configuration (matching editSchema, not supported by all triggers) and/or invocation_message to set or clear the invocation title override.\n\nUse list first to see available triggers and get their instance IDs.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["action"],
    "additionalProperties": false,
    "properties": {
      "action": {
        "type": "string",
        "enum": ["list", "view", "delete", "simulate", "edit"],
        "description": "The action to perform: \"list\" returns all active triggers, \"view\" shows details for a specific trigger, \"delete\" removes a trigger, \"simulate\" fires a test event, \"edit\" modifies an existing trigger"
      },
      "trigger_instance_id": {
        "type": "string",
        "description": "The ID of the trigger instance. Required for view, delete, simulate, and edit actions."
      },
      "edit_params": {
        "type": "object",
        "additionalProperties": {},
        "description": "Parameters for editing the trigger, matching the trigger's editSchema. When action is \"edit\", provide at least one of edit_params or invocation_message.",
        "propertyNames": {
          "type": "string"
        }
      },
      "invocation_message": {
        "anyOf": [
          {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          {
            "type": "null"
          }
        ],
        "description": "Optional message that is included each time this trigger runs. When action is \"edit\", provide at least one of edit_params or invocation_message."
      },
      "payload": {
        "type": "object",
        "additionalProperties": {},
        "description": "Test payload for the simulate action. Required when action is \"simulate\".",
        "propertyNames": {
          "type": "string"
        }
      }
    }
  }
}
```
