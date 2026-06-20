# write_file

```json
{
  "name": "write_file",
  "description": "Creates, edits, or deletes a file in the filesystem. Supports three operations: write (create or overwrite), edit (find and replace text), and delete.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["op", "path", "action_pending", "action_finished", "action_error"],
    "additionalProperties": false,
    "properties": {
      "action_pending": {
        "type": "string",
        "description": "Custom UI status text shown while running. IMPORTANT: Output these three action_ parameters before all other parameters."
      },
      "action_finished": {
        "type": "string",
        "description": "Custom UI status text shown on success."
      },
      "action_error": {
        "type": "string",
        "description": "Custom UI status text shown on failure."
      },
      "op": {
        "type": "string",
        "enum": ["write", "edit", "delete"],
        "description": "The operation type"
      },
      "path": {
        "type": "string",
        "description": "Path for the file"
      },
      "content": {
        "type": "string",
        "description": "File content, overwrites existing content (required for write op)"
      },
      "old_string": {
        "type": "string",
        "minLength": 1,
        "description": "Exact text to find and replace in the file (required for edit op)"
      },
      "new_string": {
        "type": "string",
        "description": "Replacement text, can be empty to delete old_string (required for edit op)"
      },
      "replace_all": {
        "type": "boolean",
        "description": "If true, replace all occurrences. If false (default), fails on multiple matches."
      }
    }
  }
}
```
