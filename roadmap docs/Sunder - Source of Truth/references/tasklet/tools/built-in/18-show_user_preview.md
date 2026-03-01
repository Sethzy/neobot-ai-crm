# 18. show_user_preview

- Group: Built-In Tools
- Category: UI
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "show_user_preview",
  "description": "Opens the preview panel on the right side of the user's screen and displays the file or computer use content specified.\nUse this tool to display documents, images, videos, and other files to the user.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["kind"],
    "additionalProperties": false,
    "properties": {
      "kind": {
        "type": "string",
        "enum": ["computer", "file", "app"],
        "description": "Choose computer, file, or app preview."
      },
      "filepath": {
        "type": "string",
        "description": "Required when kind is file. Path to the file to preview."
      },
      "rootPath": {
        "type": "string",
        "description": "Required when kind is app. Path to the app root folder (must contain app.tsx or index.html) or a specific .html file."
      },
      "connectionId": {
        "type": "string",
        "description": "Required when kind is computer. Use the connectionId from the computer use connection."
      },
      "title": {
        "type": "string",
        "description": "Required when kind is file/app. Shown as the preview title in the right panel."
      }
    }
  }
}
```
