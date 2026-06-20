# Complete Tasklet Tool Definitions — Verbatim

Every tool definition exactly as defined in the system. 33 tools total: 30 built-in + 3 Gmail connection tools.

---

## Built-In Tools (30)

---

### 1. read_file

```json
{
  "name": "read_file",
  "description": "Reads the contents of a file or directory by its path. If the path is a directory, returns a recursive tree-style listing of its contents. Image files are displayed directly. For PDF files, returns pages as images by default to preserve visual layout, formatting, and diagrams. Use format='text' to extract text content only. Specify optional start_line/end_line or start_page/end_page for large files. Use negative indices to count from the end (e.g., start_line: -10, end_line: -1 reads the last 10 lines).",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["path"],
    "additionalProperties": false,
    "properties": {
      "path": {
        "type": "string",
        "descption": "Absolute path to the file or directory to view (e.g., '/agent/home' or '/tmp/file.txt')"
      },
      "start_line": {
        "type": "number",
        "description": "For text files only. The line to start reading from (1-indexed). Use negative numbers to count from the end (-1 = last line, -10 = 10th from last). Defaults to 1 if not specified."
      },
      "end_line": {
        "type": "number",
        "description": "For text files only. The line to stop reading at (1-indexed, inclusive). Use negative numbers to count from the end (-1 = last line). Defaults to end of file if not specified."
      },
      "pdf_start_page": {
        "type": "number",
        "description": "For PDF files only. The page to start reading from (1-indexed). Use negative numbers to count from the end (-1 = last page). Defaults to 1 if not specified."
      },
      "pdf_end_page": {
        "type": "number",
        "description": "For PDF files only. The page to stop reading at (1-indexed, inclusive). Use negative numbers to count from the end (-1 = last page). Defaults to end of file if not specified."
      },
      "pdf_format": {
        "type": "string",
        "enum": ["image", "text"],
        "description": "For PDF files only. Specifies whether to return PDF pages as images or extracted text. Defaults to \"image\". Images provide better fidelity for complex layouts, diagrams, and formatting."
      }
    }
  }
}
```

---

### 2. write_file

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
      },
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
      }
    }
  }
}
```

---

### 3. web_search_web

```json
{
  "name": "web_search_web",
  "description": "Searches the web for relevant content based on a query",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["query"],
    "additionalProperties": false,
    "properties": {
      "query": {
        "type": "string",
        "description": "The search query to use for web search"
      },
      "limit": {
        "type": "number",
        "minimum": 1,
        "maximum": 100,
        "description": "Maximum number of results to return (default: 10, max: 100)"
      },
      "location": {
        "type": "string",
        "description": "Geographic location for search results. Examples: \"Germany\", \"San Francisco,California,United States\". Default: \"US\""
      },
      "tbs": {
        "type": "string",
        "description": "Time-based search parameter. Use predefined values: qdr:h (hour), qdr:d (day), qdr:w (week), qdr:m (month), qdr:y (year). Or custom date range: cdr:1,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY"
      }
    }
  }
}
```

---

### 4. web_scrape_website

```json
{
  "name": "web_scrape_website",
  "description": "Reads a single webpage and extracts its content as markdown",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["url"],
    "additionalProperties": false,
    "properties": {
      "url": {
        "type": "string",
        "description": "The URL of the webpage to scrape. Must be either a http:// or https:// URL."
      }
    }
  }
}
```

---

### 5. run_command

```json
{
  "name": "run_command",
  "description": "Executes shell commands in the sandbox environment.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["command", "action_pending", "action_finished", "action_error"],
    "additionalProperties": false,
    "properties": {
      "command": {
        "type": "string",
        "description": "The shell command to execute in the sandbox environment."
      },
      "timeout": {
        "type": "number",
        "maximum": 300,
        "description": "Timeout in seconds for the command. Defaults to 60 seconds."
      },
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
      }
    }
  }
}
```

---

### 6. run_agent_memory_sql

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

---

### 7. get_agent_db_schema

```json
{
  "name": "get_agent_db_schema",
  "description": "Retrieves the complete schema of the agent's SQL database, including all table definitions, column types, and row counts.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

---

### 8. send_message

```json
{
  "name": "send_message",
  "description": "Send a message to the user or other verified contact methods via:\n- Email\n- Text\n\nMessages will come from an email address or phone number associated with this agent.\n\nUse 'owner' as the recipient to send to the user's primary email (always available). For other addresses, they must be verified first using add_contact_method.\n\nFor replies to existing threads, use reply_message instead.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["to", "body"],
    "additionalProperties": false,
    "properties": {
      "to": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "The recipients (at least one required). Use 'owner' to send to the account owner's primary email address. You can also use any verified email address or phone number. Note: You cannot mix email and text recipients in the same call."
      },
      "subject": {
        "type": "string",
        "description": "The subject of the message. Required for email, disallowed for others."
      },
      "body": {
        "type": "string",
        "description": "The body of the message to send. Supports markdown for email."
      },
      "attachments": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "File paths in /agent/ to attach to the message."
      }
    }
  }
}
```

---

### 9. reply_message

```json
{
  "name": "reply_message",
  "description": "Reply to an existing message thread. For email, this sends a reply-all. For text, this continues the same conversation.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["messageId", "body"],
    "additionalProperties": false,
    "properties": {
      "messageId": {
        "type": "string",
        "description": "The message ID to reply to. This continues the conversation thread."
      },
      "body": {
        "type": "string",
        "description": "The body of the reply. Supports markdown for email."
      },
      "attachments": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "File paths in /agent/ to attach to the reply."
      }
    }
  }
}
```

---

### 10. list_contact_methods

```json
{
  "name": "list_contact_methods",
  "description": "List all available contact methods. Returns the user's primary email (use 'owner' as recipient) and any verified additional contact methods.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

---

### 11. add_contact_method

```json
{
  "name": "add_contact_method",
  "description": "Add a new contact method. Supported types:\n- Email\n- Text\n\nContact methods must be verified before you can send messages to them. It's important you help the user verify any required new contact methods before you need to use them.\n\nVerification process:\n- Email: The recipient clicks a verification link sent to their inbox\n- Text: The recipient verifies by sending a text message to a provided number\n\nThe owner's primary email (use 'owner' in send_message) is always available without verification.\nThe agent will pause execution while waiting for verification to complete.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["type", "value", "name"],
    "additionalProperties": false,
    "properties": {
      "type": {
        "type": "string",
        "enum": ["email", "text"],
        "description": "The type of contact method:\n- 'email' for Email\n- 'text' for Text"
      },
      "value": {
        "type": "string",
        "description": "The contact value:\n- For email: email address\n- For text: phone number in E.164 format (e.g., +12025551234). Only iMessage-enabled numbers are supported (most iPhones). Android and non-iMessage numbers will be rejected."
      },
      "name": {
        "type": "string",
        "description": "Label for this contact method (e.g., 'Work Email', 'John Doe'). This name is used as the sender name in outgoing emails."
      }
    }
  }
}
```

---

### 12. manage_tasks

```json
{
  "name": "manage_tasks",
  "description": "Manage task items for this agent. Supports batch operations for efficiency.\n\nOperations:\n- add: Create a new task with a title and optional payload. taskId MUST NOT be set.\n- update: Modify an existing task's title or payload. taskId is REQUIRED.\n- delete: Remove a task to mark it as done. taskId is REQUIRED.\n\nYou can perform multiple operations in a single call (e.g., add multiple tasks, update several at once, or mix different operations).\n\nNote: All current tasks are visible in the agent's synced state.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["operations"],
    "additionalProperties": false,
    "properties": {
      "operations": {
        "type": "array",
        "minItems": 1,
        "description": "Array of task operations to perform. You can add, update, or delete multiple tasks in a single call.",
        "items": {
          "type": "object",
          "required": ["operation"],
          "additionalProperties": false,
          "properties": {
            "operation": {
              "type": "string",
              "enum": ["add", "update", "delete"],
              "description": "The operation to perform: add (create new task, taskId must NOT be set), update (modify existing task), delete (remove task to mark it as done)"
            },
            "taskId": {
              "type": "string",
              "description": "The ID of the task. REQUIRED for update and delete operations. MUST NOT be set for add operation."
            },
            "title": {
              "type": "string",
              "description": "The title of the task (required for add, optional for update)"
            },
            "payload": {
              "description": "Optional JSON payload attached to the task for additional information in addition to the title"
            }
          }
        }
      }
    }
  }
}
```

---

### 13. list_tasks

```json
{
  "name": "list_tasks",
  "description": "List tasks for this agent. Can optionally filter by specific task IDs.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "taskIds": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Optional array of task IDs to filter. If not provided, returns all tasks."
      }
    }
  }
}
```

---

### 14. run_subagent

```json
{
  "name": "run_subagent",
  "description": "Runs a subagent to handle work efficiently outside of your main context. Returns the final message from the subagent as its result.\nRunning subagents reduces costs and keeps your context focused. This is especially useful when you are doing similar work multiple times.\n\nThe subagent receives the content of the markdown file followed by any payload data you provide in the first user message.\n\nBefore running a subagent, consider whether the subagent's approach still fits the current situation - you can always update its file with write_file if needed.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["path", "action_pending", "action_finished", "action_error"],
    "additionalProperties": false,
    "properties": {
      "path": {
        "type": "string",
        "description": "Full path to the subagent markdown file (e.g., \"/agent/subagents/email_processor.md\")"
      },
      "payload": {
        "type": "string",
        "description": "Optional data to pass to the subagent that will be added after the subagent's instructions in the first user message. This allows the same subagent to process different inputs."
      },
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
      }
    }
  }
}
```

---

### 15. search_triggers

```json
{
  "name": "search_triggers",
  "description": "Search for available triggers by keywords.\nReturns a list of trigger types that match the search criteria, along with their setup schemas and any prerequisites.\n\nUse this tool to discover what triggers are available before setting one up.\n\nThe setupSchema field of each returned trigger describes the schema of the params object that should\nbe passed into the setup_trigger tool.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["keywords"],
    "additionalProperties": false,
    "properties": {
      "keywords": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "One or more keywords to search for available triggers (e.g., [\"email\", \"schedule\"])"
      }
    }
  }
}
```

---

### 16. setup_trigger

```json
{
  "name": "setup_trigger",
  "description": "Set up a new trigger instance. First use search_triggers to find available triggers\nand their setup schemas, then call this tool with the trigger ID and required parameters.\nOn completion, shows the user a UI card with the trigger details.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["trigger_id", "params"],
    "additionalProperties": false,
    "properties": {
      "trigger_id": {
        "type": "string",
        "description": "The ID of the trigger type to set up (e.g., \"schedule\", \"webhook\", \"gmail\", \"rss\")"
      },
      "params": {
        "type": "object",
        "additionalProperties": {},
        "propertyNames": {
          "type": "string"
        },
        "description": "Setup parameters as defined by the trigger's setupSchema"
      }
    }
  }
}
```

---

### 17. manage_active_triggers

```json
{
  "name": "manage_active_triggers",
  "description": "Manage the agent's active triggers.\n\nActions:\n- list: Returns all active triggers with their IDs, names, titles, and arguments.\n- view: Shows detailed information for a specific trigger. Requires trigger_instance_id.\n- delete: Removes an active trigger. Requires trigger_instance_id. This is destructive.\n- simulate: Fires a test event on a trigger to test the agent's response. Requires trigger_instance_id and payload.\n\nUse list first to see available triggers and get their instance IDs.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["action"],
    "additionalProperties": false,
    "properties": {
      "action": {
        "type": "string",
        "enum": ["list", "view", "delete", "simulate"],
        "description": "The action to perform: \"list\" returns all active triggers, \"view\" shows details for a specific trigger, \"delete\" removes a trigger, \"simulate\" fires a test event"
      },
      "trigger_instance_id": {
        "type": "string",
        "description": "The ID of the trigger instance. Required for view, delete, and simulate actions."
      },
      "payload": {
        "type": "object",
        "additionalProperties": {},
        "propertyNames": {
          "type": "string"
        },
        "description": "Test payload for the simulate action. Required when action is \"simulate\"."
      }
    }
  }
}
```

---

### 18. show_user_preview

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

---

### 19. close_user_preview

```json
{
  "name": "close_user_preview",
  "description": "Closes the right-side preview panel.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

---

### 20. create_tasklet_app

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

---

### 21. rename_chat

```json
{
  "name": "rename_chat",
  "description": "Renames the chat. Titles should be a concise 3-5 word summary that captures the goal and key tools. If the user requests a specific name, use that name.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["new_title"],
    "additionalProperties": false,
    "properties": {
      "new_title": {
        "type": "string",
        "description": "The new title for the chat."
      }
    }
  }
}
```

---

### 22. get_user_quota_status

```json
{
  "name": "get_user_quota_status",
  "description": "Returns the agent owner's current daily usage quota information including the percentage consumed and the time when the quota resets.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

---

### 23. list_users_connections

```json
{
  "name": "list_users_connections",
  "description": "Lists all connections to external services that the user has already created in their account.\nReturns connectionId, serviceName, description, accountName, connectionType, toolCount, and connection-specific details for each connection.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

---

### 24. get_details_for_connections

```json
{
  "name": "get_details_for_connections",
  "description": "Gets detailed information for the listed connections.\nReturns a full list of tools, including both activated and deactivated tools, for each connection, including full detailed descriptions and arguments if requested.\nAlso returns connectionId, serviceName, description, accountName, connectionType, toolCount, and other connection-specific details.\n\nUse this to:\n- Discover what actions you can perform with a connection before activating it\n- Check which tools are already activated for a connection\n- Verify exact tool names before activating connections",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["connectionIds", "includeToolDetails"],
    "additionalProperties": false,
    "properties": {
      "connectionIds": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "The connection IDs to get details for"
      },
      "includeToolDetails": {
        "type": "boolean",
        "description": "Pass true to include detailed descriptions and arguments for each connnection tool in the results"
      }
    }
  }
}
```

---

### 25. get_integrations_capabilities

```json
{
  "name": "get_integrations_capabilities",
  "description": "Lists the capabilities available via the given integrations, including tools (if available), quality information (GREAT, GOOD, OK, LIMITED, and UNKNOWN), and notes.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["integrationIds"],
    "additionalProperties": false,
    "properties": {
      "integrationIds": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "The list of integration IDs to get capabilities for."
      }
    }
  }
}
```

---

### 26. search_for_integrations

```json
{
  "name": "search_for_integrations",
  "description": "Lists integrations that match one or more given keywords. Keywords are single words (e.g. email, billing, tasks, Gmail, Asana, etc.).\nSearches integrations built by the Tasklet team as well as integrations from Pipedream (over 3000 total) and returns:\n- Integration ID\n- Name and description\n- Quality score (GREAT/GOOD/OK/LIMITED/UNKNOWN)\n- Who built it\n- Additional context about its capabilities and usage\n\nNEVER mention integration quality scores or who built the integrations unless the user specifically asks.\n\nOnce you have the integration ID you can get more information about it if needed using get_integrations_capabilities.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["keywords"],
    "additionalProperties": false,
    "properties": {
      "keywords": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "The list of keywords to search for. Each keyword must be a single word. Verify exact tool names by calling get_integrations_capabilities first."
      }
    }
  }
}
```

---

### 27. manage_activated_tools_for_connections

```json
{
  "name": "manage_activated_tools_for_connections",
  "description": "Activates or deactivates tools for connections.\nChanging activation status of tools requires the user to approve the permission changes, so a UI card will be displayed to the user where they can approve or reject the changes.\nThe tool will return after the user approves or rejects the permission changes.\n\nReturns an array of objects for each connection:\n- connectionId: the connection ID\n- userAction: 'approved' if user approved the changes, 'skipped' if user rejected\n- tools: { activated: string[], deactivated: string[] } - lists of tool names currently activated/deactivated for the connection\n- skills: (optional) instructions to read the skills file for this connection.\n\nActivated tools will then become available to use and will appear in your tool context with the tool name prefixed by the connection ID.\nYou MUST always verify exact tool names before activating them. Use get_details_for_connections to see tool names and descriptions for a connection. Never guess a tool name.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["connections"],
    "additionalProperties": false,
    "properties": {
      "connections": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["connectionId", "activate", "deactivate"],
          "additionalProperties": false,
          "properties": {
            "connectionId": {
              "type": "string",
              "description": "The connectionId to activate or deactivate tools for. Must be a valid connectionId from the user's existing connections."
            },
            "activate": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "Tool names to activate from this connection. Always verify exact tool names before activating them."
            },
            "deactivate": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "Tool names to deactivate from this connection."
            }
          }
        }
      }
    }
  }
}
```

---

### 28. reauthorize_connection

```json
{
  "name": "reauthorize_connection",
  "description": "Re-authorizes an existing connection that has expired or needs new permissions. Displays a UI card where the user can complete the auth flow to re-authorize the connection.\n\nUse this tool if and only if there were authorization errors with a connection or the user explicitly asks you to.\nThe connection must already exist in the user's account.\nRe-authorizing cannot change which account the connection is logged into in the external service.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["connectionId"],
    "additionalProperties": false,
    "properties": {
      "connectionId": {
        "type": "string",
        "description": "The connectionId to reauthorize. This must be a valid connectionId from the user's existing connections."
      }
    }
  }
}
```

---

### 29. delete_connection

```json
{
  "name": "delete_connection",
  "description": "PERMANENTLY DELETES a connection from the user's account. Displays a confirmation UI showing all agents that use this connection before deletion. This destroys the stored credentials and cannot be undone.\n\nWARNING: This is a destructive action. Only use when the user explicitly wants to DELETE the connection itself (e.g., \"delete this connection\", \"remove from my account\").\nDO NOT use this tool if the user wants to remove or deactivate tools from a connection (e.g., \"remove {connection name}\") → use manage_activated_tools_for_connections instead",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["connectionId"],
    "additionalProperties": false,
    "properties": {
      "connectionId": {
        "type": "string",
        "description": "The connectionId to delete. Must be a valid connectionId from the user's existing connections."
      }
    }
  }
}
```

---

### 30. create_new_connections

```json
{
  "name": "create_new_connections",
  "description": "Creates new connections to external services.\nDisplays a UI card where the user can choose to create each connection or skip it.\nCreating a connection will authenticate the user to the service and then save the connection to the user's account so they can use it in other agents in the future.\n\nIMPORTANT: You MUST read /agent/skills/system/creang-connections/SKILL.md for detailed setup instructions before using this tool.\n\nSupports the creation of 4 different types of connections: pre-built integrations, custom MCP, Direct API (HTTP) and Computer Use.\nFor pre-built integrations supports the creation of multiple connections at once. All others support only one connection creation at a time.\n\nFor each connection creation request returns:\n- userAction: 'created' if user authorized, 'skipped' if user declined.\n\nIf successfully created, also returns:\n- connectionId: the new connection ID. Don't mention the connectionId to the user.\n- tools: { activated: string[], deactivated: string[] } - list of all connection tool names by activation state\n- connection-specific details",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["connection"],
    "additionalProperties": false,
    "properties": {
      "connection": {
        "anyOf": [
          {
            "type": "object",
            "required": ["type", "integrations"],
            "additionalProperties": false,
            "properties": {
              "type": {
                "type": "string",
                "const": "integrations",
                "description": "Create connections from pre-built integrations"
              },
              "integrations": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": ["integrationId"],
                  "additionalProperties": false,
                  "properties": {
                    "integrationId": {
                      "type": "string",
                      "description": "The integration id"
                    },
                    "toolsToActivate": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      },
                      "description": "The list of tools to activate once the connection is created."
                    }
                  }
                },
                "description": "The list of integrations to create connections for."
              }
            }
          },
          {
            "type": "object",
            "required": ["type"],
            "additionalProperties": false,
            "properties": {
              "type": {
                "type": "string",
                "const": "mcp",
                "description": "Create a connection to an MCP server"
              },
              "displayName": {
                "type": "string",
                "description": "A short human-readable display name for the MCP server"
              },
              "serverUrl": {
                "type": "string",
                "description": "The URL of the MCP server to connect to. Must have the https:// prefix. The user can edit or even completely rewrite the value during the setup."
              }
            }
          },
          {
            "type": "object",
            "required": ["type", "serviceName", "description", "connectionName", "baseUrl", "methods", "authConfig", "notes"],
            "additionalProperties": false,
            "properties": {
              "type": {
                "type": "string",
                "const": "direct_api",
                "description": "Create a custom HTTP API connection"
              },
              "serviceName": {
                "type": "string",
                "description": "Name of the remote service (e.g., \"OpenAI API\", \"Stripe\")"
              },
              "description": {
                "type": "string",
                "description": "Clear description of what this service does"
              },
              "connectionName": {
                "type": "string",
                "minLength": 1,
                "maxLength": 32,
                "description": "Human-readable name (1-32 chars)"
              },
              "baseUrl": {
                "type": "string",
                "description": "The base URL of the API. Be extremely careful to find the correct base URL for the API."
              },
              "methods": {
                "type": "array",
                "items": {
                  "type": "string",
                  "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]
                },
                "minItems": 1,
                "description": "HTTP methods to allow"
              },
              "authConfig": {
                "type": "object",
                "additionalProperties": {},
                "propertyNames": {
                  "type": "string"
                },
                "description": "Authentication config object. Read /agent/skills/system/creating-connections/create-direct-api-connection.md for schema."
              },
              "notes": {
                "type": "string",
                "description": "Markdown notes for this connection"
              },
              "testCases": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": {},
                  "propertyNames": {
                    "type": "string"
                  }
                },
                "maxItems": 3,
                "description": "Test cases to verify the API connection works. See skill file for schema."
              }
            }
          },
          {
            "type": "object",
            "required": ["type", "displayName"],
            "additionalProperties": false,
            "properties": {
              "type": {
                "type": "string",
                "const": "computer_use",
                "description": "Provision a remote computer for browser or desktop UI use. This is expensive and slow."
              },
              "displayName": {
                "type": "string",
                "description": "A clear, purposeful display name for this computer (e.g., \"Development Computer\", \"Testing Computer\")."
              }
            }
          }
        ]
      }
    }
  }
}
```

---

## Gmail Connection Tools (3)

These are prefixed with `conn_c847rp4x7q86d8mwyytj__` when called.

---

### 31. gmail_search_threads

```json
{
  "name": "gmail_search_threads",
  "description": "Search Gmail threads using Gmail search syntax. Returns threads and messages with IDs and fields from the readMask.\n<search-strategy>\n  Query Construction:\n  - Keyword searches may be overly restrictive. For time-based tasks, prefer date ranges: \"after:2024/01/15\", \"newer_than:7d\", \"older_than:1y\"\n  - When keywords are needed, use OR operators: \"dinner OR lunch OR meeting\", \"project OR proposal\"\n  - Label filters are most effective: \"label:important\", \"label:sent\", \"from:@company.com OR to:@company.com\"\n  - User labels must specify the name, not the label ID. Use gmail_search_labels to get the names of user labels. Label names with spaces should have the spaces replaced with hyphens: \"label:my-label-name\"\n  - Combine approaches: \"label:sent newer_than:2m\", \"has:attachment after:2024/01/01\"\n\n  Search Iteration:\n  - Be thorough with your searches. If initial search doesn't find necessary information, try different approaches\n  - Start broader, then narrow down. Consider alternative date ranges, keyword combinations, or label filters\n  - You should be willing to try up to 5 different queries before giving up\n\n  Completeness:\n  - Remember to retrieve and use ALL relevant results from searches\n  - Use the nextPageToken to get complete results: make sequential calls with pageToken to get more than the maximum results for a single search\n</search-strategy>",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["query", "readMask"],
    "additionalProperties": false,
    "properties": {
      "query": {
        "type": "string",
        "description": "Gmail search query. Examples: \"from:me\", \"to:john@example.com\", \"subject:dinner\", \"after:2024/04/16\", \"newer_than:7d\", \"older_than:1y\" (h/d/m/y), \"has:attachment\", \"is:unread\", \"(from:@foo.com OR to:@bar.com)\", \"dinner -movie\", \"exact phrase\", \"label:my-label\". Common system labels: inbox, unread, sent, spam, trash, starred, important. Use hyphens in label names instead of spaces, but be sure to include the full label name including any other characters, e.g. for a label named \"Test: label.$  42\", use \"label:Test:-label.$--42\". Use parentheses to group OR queries."
      },
      "readMask": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["date", "participants", "subject", "bodySnippet", "bodyFull", "bodyHtml", "labels", "attachments"]
        },
        "default": ["date", "participants", "subject", "bodySnippet"],
        "description": "Array of fields to include in the response. Options: date (message date), participants (from/to/cc/bcc), subject (email subject), bodySnippet (brief excerpt), bodyFull (complete message body as markdown), bodyHtml (raw HTML body), labels (message labels), attachments (attachment info). Default includes basic metadata with snippet. Only include bodyFull or bodyHtml if you need to read the complete message content."
      },
      "maxResults": {
        "type": "number",
        "minimum": 1,
        "maximum": 100,
        "description": "Number of results to return (max 100)"
      },
      "pageToken": {
        "type": "string",
        "description": "Page token to continue from. Use to get the next page of results from a previous search that returned a nextPageToken."
      },
      "includeSpamTrash": {
        "type": "boolean",
        "description": "Include messages from label:spam and label:trash in the results (default: false)"
      }
    }
  }
}
```

---

### 32. gmail_get_threads

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

---

### 33. gmail_send_message

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

---

## Summary

| # | Tool Name | Category |
|---|---|---|
| 1 | read_file | Filesystem |
| 2 | write_file | Filesystem |
| 3 | web_search_web | Web |
| 4 | web_scrape_website | Web |
| 5 | run_command | Sandbox |
| 6 | run_agent_memory_sql | Database |
| 7 | get_agent_db_schema | Database |
| 8 | send_message | Messaging |
| 9 | reply_message | Messaging |
| 10 | list_contact_methods | Messaging |
| 11 | add_contact_method | Messaging |
| 12 | manage_tasks | Tasks |
| 13 | list_tasks | Tasks |
| 14 | run_subagent | Subagents |
| 15 | search_triggers | Triggers |
| 16 | setup_trigger | Triggers |
| 17 | manage_active_triggers | Triggers |
| 18 | show_user_preview | UI |
| 19 | close_user_preview | UI |
| 20 | create_tasklet_app | UI |
| 21 | rename_chat | UI |
| 22 | get_user_quota_status | Account |
| 23 | list_users_connections | Connections |
| 24 | get_details_for_connections | Connections |
| 25 | get_integrations_capabilities | Connections |
| 26 | search_for_integrations | Connections |
| 27 | manage_activated_tools_for_connections | Connections |
| 28 | reauthorize_connection | Connections |
| 29 | delete_connection | Connections |
| 30 | create_new_connections | Connections |
| 31 | gmail_search_threads | Gmail (Connection) |
| 32 | gmail_get_threads | Gmail (Connection) |
| 33 | gmail_send_message | Gmail (Connection) |
