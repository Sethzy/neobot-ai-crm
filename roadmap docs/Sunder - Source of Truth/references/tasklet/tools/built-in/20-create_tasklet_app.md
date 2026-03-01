# 20. create_tasklet_app

- Group: Built-In Tools
- Category: UI
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "create_tasklet_app",
  "description": "Scaffolds a new multi-file TSX preview app under /agent/home/apps/<name>/ with a working hello world, DaisyUI styling, and typed bridge wrappers.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["name"],
    "additionalProperties": false,
    "properties": {
      "name": {
        "type": "string",
        "description": "App name (lowercase, hyphens allowed). Used as the directory name under /agent/home/apps/."
      }
    }
  }
}
```
