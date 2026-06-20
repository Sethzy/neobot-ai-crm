# toggle_pin_app

```json
{
  "name": "toggle_pin_app",
  "description": "Pins or unpins an app in the user's sidebar. Only call this when the user explicitly asks to pin or unpin an app — you may suggest pinning, but do not pin automatically.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["rootPath", "pinned"],
    "additionalProperties": false,
    "properties": {
      "rootPath": {
        "type": "string",
        "description": "Path to the app root folder (e.g. /agent/home/apps/my-app)."
      },
      "pinned": {
        "type": "boolean",
        "description": "True to pin the app to the sidebar, false to unpin it."
      }
    }
  }
}
```
