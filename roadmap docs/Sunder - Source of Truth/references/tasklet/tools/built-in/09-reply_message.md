# 9. reply_message

- Group: Built-In Tools
- Category: Messaging
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "reply_message",
  "description": "Reply to an existing message thread. For email, this sends a reply-all. For text, this continues the same conversation.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["messageId", "body"],
    "additionalProperties": false,
    "properties": {
      "messageId": {
        "type": "string",
        "description": "The message ID to reply to. This continues the conversation thread."
      },
      "body": {
        "type": "string",
        "description": "The body of the reply. Supports markdown for email."
      },
      "attachments": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "File paths in /agent/ to attach to the reply."
      }
    }
  }
}
```
