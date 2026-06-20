# run_agent_memory_sql

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
