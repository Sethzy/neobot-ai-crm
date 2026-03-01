# 6. run_agent_memory_sql

- Group: Built-In Tools
- Category: Database
- Source: ../00-complete-tasklet-tool-definitions-verbatim.md

```json
{
  "name": "run_agent_memory_sql",
  "description": "Runs a SQL query against the agent's SQL database.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["query"],
    "additionalProperties": false,
    "properties": {
      "query": {
        "type": "string",
        "description": "The SQL query to execute. Must be a single SQL statement."
      }
    }
  }
}
```
