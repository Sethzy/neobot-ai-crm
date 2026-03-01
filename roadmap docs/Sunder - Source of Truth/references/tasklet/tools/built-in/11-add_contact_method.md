# 11. add_contact_method

- Group: Built-In Tools
- Category: Messaging
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "add_contact_method",
  "description": "Add a new contact method. Supported types:\n- Email\n- Text\n\nContact methods must be verified before you can send messages to them. It's important you help the user verify any required new contact methods before you need to use them.\n\nVerification process:\n- Email: The recipient clicks a verification link sent to their inbox\n- Text: The recipient verifies by sending a text message to a provided number\n\nThe owner's primary email (use 'owner' in send_message) is always available without verification.\nThe agent will pause execution while waiting for verification to complete.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["type", "value", "name"],
    "additionalProperties": false,
    "properties": {
      "type": {
        "type": "string",
        "enum": ["email", "text"],
        "description": "The type of contact method:\n- 'email' for Email\n- 'text' for Text"
      },
      "value": {
        "type": "string",
        "description": "The contact value:\n- For email: email address\n- For text: phone number in E.164 format (e.g., +12025551234). Only iMessage-enabled numbers are supported (most iPhones). Android and non-iMessage numbers will be rejected."
      },
      "name": {
        "type": "string",
        "description": "Label for this contact method (e.g., 'Work Email', 'John Doe'). This name is used as the sender name in outgoing emails."
      }
    }
  }
}
```
