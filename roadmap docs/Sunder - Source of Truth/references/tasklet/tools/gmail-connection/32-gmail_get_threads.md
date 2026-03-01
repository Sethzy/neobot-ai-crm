# 32. gmail_get_threads

- Group: Gmail Connection Tools
- Category: Gmail (Connection)
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "gmail_get_threads",
  "description": "Get specific email threads by IDs from Gmail with configurable detail level using readMask",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["threadIds", "readMask"],
    "additionalProperties": false,
    "properties": {
      "threadIds": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "The IDs of the threads to retrieve. Max 1000 threads."
      },
      "readMask": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["date", "participants", "subject", "bodySnippet", "bodyFull", "bodyHtml", "labels", "attachments"]
        },
        "default": ["date", "participants", "subject", "bodySnippet"],
        "description": "Array of fields to include in the response. Options: date (message date), participants (from/to/cc/bcc), subject (email subject), bodySnippet (brief excerpt), bodyFull (complete message body as markdown), bodyHtml (raw HTML body), labels (message labels), attachments (attachment info). Default includes basic metadata with snippet. Only include bodyFull or bodyHtml if you need to analyze message content."
      }
    }
  }
}
```
