# suggest_intelligence_level_change

```json
{
  "name": "suggest_intelligence_level_change",
  "description": "Shows a UI prompt asking the user whether to change intelligence. The user can pick any intelligence option or skip and continue at their current level. Only use this tool when the user explicitly asks to change intelligence or when a skill instructs you to.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["suggestedIntelligence", "message"],
    "additionalProperties": false,
    "properties": {
      "suggestedIntelligence": {
        "type": "string",
        "enum": ["standard", "advanced", "expert", "genius"],
        "description": "The recommended intelligence level. For instant app work, recommend expert or higher unless the user prefers otherwise."
      },
      "message": {
        "type": "string",
        "description": "Short explanation shown to the user about why changing intelligence may help."
      }
    }
  }
}
```
