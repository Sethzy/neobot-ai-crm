# create_instant_app

```json
{
  "name": "create_instant_app",
  "description": "Scaffolds a new multi-file TSX instant app under /agent/home/apps/<name>/ with a working hello world, DaisyUI styling, and typed bridge wrappers. The manifest (tasklet.config.json) stores the displayName and description. Infer name, displayName, and description from the conversation context — do not ask the user for these values.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["name", "displayName", "description"],
    "additionalProperties": false,
    "properties": {
      "name": {
        "type": "string",
        "description": "Filesystem-safe app name (lowercase, hyphens allowed). Used as the directory name under /agent/home/apps/."
      },
      "displayName": {
        "type": "string",
        "description": "Human-readable display name shown in the preview panel titlebar (e.g. \"Expense Tracker\", \"Project Dashboard\")."
      },
      "description": {
        "type": "string",
        "description": "Short description of what the app does."
      }
    }
  }
}
```
