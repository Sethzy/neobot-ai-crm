# 8. send_message

- Group: Built-In Tools
- Category: Messaging
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "send_message",
  "description": "Send a message to the user or other verified contact methods via:\n- Email\n- Text\n\nMessages will come from an email address or phone number associated with this agent.\n\nUse 'owner' as the recipient to send to the user's primary email (always available). For other addresses, they must be verified first using add_contact_method.\n\nFor replies to existing threads, use reply_message instead.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["to", "body"],
    "additionalProperties": false,
    "properties": {
      "to": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "The recipients (at least one required). Use 'owner' to send to the account owner's primary email address. You can also use any verified email address or phone number. Note: You cannot mix email and text recipients in the same call."
      },
      "subject": {
        "type": "string",
        "description": "The subject of the message. Required for email, disallowed for others."
      },
      "body": {
        "type": "string",
        "description": "The body of the message to send. Supports markdown for email."
      },
      "attachments": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "File paths in /agent/ to attach to the message."
      }
    }
  }
}
```
