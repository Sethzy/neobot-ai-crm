# 33. gmail_send_message

- Group: Gmail Connection Tools
- Category: Gmail (Connection)
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "gmail_send_message",
  "description": "Send an email message immediately to recipients on behalf of the user. Use only when the user has explicitly requested to SEND an email (not when they want to compose, draft, or prepare). This tool sends emails to other people, not to the user themselves.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["to", "subject"],
    "additionalProperties": false,
    "properties": {
      "to": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Recipient email addresses"
      },
      "subject": {
        "type": "string",
        "description": "Email subject. If replying to an email, use the subject of the original email."
      },
      "body": {
        "type": "string",
        "description": "Email body as markdown (converted to HTML). Provide body OR bodyHtml, not both."
      },
      "bodyHtml": {
        "type": "string",
        "description": "Email body as raw HTML. Do not wrap in CDATA tags. IMPORTANT: Use inline styles (style=\"...\") instead of <style> tags or CSS classes, as email clients do not support external CSS. Provide body OR bodyHtml, not both."
      },
      "cc": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "CC recipient email addresses"
      },
      "bcc": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "BCC recipient email addresses"
      },
      "from": {
        "type": "string",
        "description": "Send-as alias for the \"From:\" header. Can be an email address (e.g., \"alias@example.com\") or a display name with email (e.g., \"Display Name <alias@example.com>\"). If omitted, uses the default sending address."
      },
      "replyToMessageId": {
        "type": "string",
        "description": "Message ID to reply to (for proper email threading)"
      },
      "includeSignature": {
        "type": "boolean",
        "description": "Include the user's Gmail signature in the message. If a \"from\" alias is specified, uses that alias's signature; otherwise uses the default signature."
      },
      "attachments": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "File paths in /agent/ to attach to the email (e.g., [\"/agent/home/report.pdf\"])"
      }
    }
  }
}
```
