# Claude Code Tool Definitions (Verbatim)

> Source: https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/Anthropic/Claude%20Code/Tools.json
> Official reference: https://code.claude.com/docs/en/settings#tools-available-to-claude
> Version: Extracted ~Aug 2025 (Sonnet 4 era). Tool set evolves across versions.
> Total token cost: ~11,438 tokens for tool definitions alone

---

## Complete Tool Inventory

| Tool | Category | Permission Required | Description |
|------|----------|-------------------|-------------|
| **Task** | Orchestration | No | Launch subagents for complex multi-step tasks |
| **TaskCreate** | Orchestration | No | Create a new task in the task list |
| **TaskGet** | Orchestration | No | Retrieve full details for a specific task |
| **TaskList** | Orchestration | No | List all tasks with current status |
| **TaskUpdate** | Orchestration | No | Update task status, dependencies, details |
| **TaskOutput** | Orchestration | No | Retrieve output from background task |
| **Bash** | Execution | Yes | Execute shell commands with timeout |
| **Read** | File Ops | No | Read file contents (text, images, PDFs, notebooks) |
| **Edit** | File Ops | Yes | Targeted string replacements in files |
| **Write** | File Ops | Yes | Create or overwrite files |
| **Glob** | Search | No | Find files by pattern matching |
| **Grep** | Search | No | Search file contents with regex (ripgrep) |
| **LS** | Search | No | List files and directories |
| **WebFetch** | Web | Yes | Fetch and process URL content |
| **WebSearch** | Web | Yes | Search the web with domain filtering |
| **NotebookEdit** | File Ops | Yes | Modify Jupyter notebook cells |
| **TodoWrite** | Planning | No | Create/manage structured task list (legacy, replaced by Task*) |
| **AskUserQuestion** | Elicitation | No | Ask multiple-choice questions |
| **ExitPlanMode** | Planning | Yes | Signal plan completion, request approval |
| **Skill** | Orchestration | Yes | Execute a skill within main conversation |
| **KillShell** | Execution | No | Kill a running background bash shell |
| **MCPSearch** | Orchestration | No | Search for and load MCP tools on demand |
| **LSP** | Code Intel | No | Language server operations (type errors, definitions, references) |

---

## Tool Schemas (Verbatim JSON)

### 1. Task (Subagent Launcher)

```json
{
  "name": "Task",
  "input_schema": {
    "type": "object",
    "properties": {
      "description": {
        "type": "string",
        "description": "A short (3-5 word) description of the task"
      },
      "prompt": {
        "type": "string",
        "description": "The task for the agent to perform"
      },
      "subagent_type": {
        "type": "string",
        "description": "The type of specialized agent to use for this task"
      }
    },
    "required": ["description", "prompt", "subagent_type"],
    "additionalProperties": false
  }
}
```

**Key instruction excerpts from description:**
- Available agent types: `general-purpose` (Tools: *), `statusline-setup` (Tools: Read, Edit), `output-style-setup` (Tools: Read, Write, Edit, Glob, LS, Grep)
- When NOT to use: specific file reads, class definition searches, searching within 2-3 files
- Launch multiple agents concurrently for performance
- Each invocation is stateless — prompt must be self-contained
- Agent results are not visible to user — summarize back

### 2. Bash

```json
{
  "name": "Bash",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "description": "The command to execute"
      },
      "timeout": {
        "type": "number",
        "description": "Optional timeout in milliseconds (max 600000)"
      },
      "description": {
        "type": "string",
        "description": "Clear, concise description of what this command does in 5-10 words"
      }
    },
    "required": ["command"],
    "additionalProperties": false
  }
}
```

**Key instruction excerpts:**
- Persistent shell session
- Contains full git commit instructions (HEREDOC format, never update git config, never push unless asked)
- Contains full PR creation instructions (gh pr create format)
- Never use `-i` flag (interactive)

### 3. Glob

```json
{
  "name": "Glob",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": {
        "type": "string",
        "description": "The glob pattern to match files against"
      },
      "path": {
        "type": "string",
        "description": "The directory to search in. Omit for current working directory."
      }
    },
    "required": ["pattern"],
    "additionalProperties": false
  }
}
```

### 4. Grep

```json
{
  "name": "Grep",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": {
        "type": "string",
        "description": "The regular expression pattern to search for"
      },
      "path": {
        "type": "string",
        "description": "File or directory to search in"
      },
      "glob": {
        "type": "string",
        "description": "Glob pattern to filter files"
      },
      "output_mode": {
        "type": "string",
        "enum": ["content", "files_with_matches", "count"],
        "description": "Output mode. Default: files_with_matches"
      },
      "-B": { "type": "number", "description": "Lines before match" },
      "-A": { "type": "number", "description": "Lines after match" },
      "-C": { "type": "number", "description": "Context lines" },
      "-n": { "type": "boolean", "description": "Show line numbers" },
      "-i": { "type": "boolean", "description": "Case insensitive" },
      "type": { "type": "string", "description": "File type filter (js, py, rust, etc.)" },
      "multiline": { "type": "boolean", "description": "Enable multiline matching" },
      "head_limit": { "type": "number", "description": "Limit output to first N entries" }
    },
    "required": ["pattern"],
    "additionalProperties": false
  }
}
```

**Key instruction:** Built on ripgrep. NEVER invoke `grep` or `rg` as a Bash command.

### 5. LS

```json
{
  "name": "LS",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Absolute path to directory to list"
      },
      "ignore": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Glob patterns to ignore"
      }
    },
    "required": ["path"],
    "additionalProperties": false
  }
}
```

### 6. Read

```json
{
  "name": "Read",
  "input_schema": {
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "Absolute path to the file to read"
      },
      "offset": {
        "type": "number",
        "description": "Line number to start reading from"
      },
      "limit": {
        "type": "number",
        "description": "Number of lines to read"
      }
    },
    "required": ["file_path"],
    "additionalProperties": false
  }
}
```

**Key instruction:** Reads up to 2000 lines by default. Supports images (multimodal), PDFs, Jupyter notebooks. Results in `cat -n` format.

### 7. Edit

```json
{
  "name": "Edit",
  "input_schema": {
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "Absolute path to file"
      },
      "edits": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "old_string": { "type": "string", "description": "Text to replace" },
            "new_string": { "type": "string", "description": "Replacement text" },
            "replace_all": { "type": "boolean", "default": false }
          },
          "required": ["old_string", "new_string"],
          "additionalProperties": false
        },
        "minItems": 1,
        "description": "Array of edit operations to perform sequentially"
      }
    },
    "required": ["file_path", "edits"],
    "additionalProperties": false
  }
}
```

**Key instruction:** Must Read file first. Exact string matching (including whitespace). Edits applied sequentially. Can create new files with empty `old_string`.

### 8. Write

```json
{
  "name": "Write",
  "input_schema": {
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "Absolute path to file (must be absolute)"
      },
      "content": {
        "type": "string",
        "description": "Content to write"
      }
    },
    "required": ["file_path", "content"],
    "additionalProperties": false
  }
}
```

**Key instruction:** Must Read existing file first. Prefer Edit for modifications. Never proactively create docs/README files.

### 9. WebFetch

```json
{
  "name": "WebFetch",
  "input_schema": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "format": "uri",
        "description": "URL to fetch"
      },
      "prompt": {
        "type": "string",
        "description": "Prompt to run on fetched content"
      }
    },
    "required": ["url", "prompt"],
    "additionalProperties": false
  }
}
```

**Key instruction:** Converts HTML to markdown. Processes with a small, fast model. Has redirect handling. Prefer MCP web fetch tools if available.

### 10. WebSearch

```json
{
  "name": "WebSearch",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query"
      }
    },
    "required": ["query"],
    "additionalProperties": false
  }
}
```

### 11. NotebookEdit

```json
{
  "name": "NotebookEdit",
  "input_schema": {
    "type": "object",
    "properties": {
      "notebook_path": { "type": "string" },
      "cell_id": { "type": "string" },
      "new_source": { "type": "string" },
      "cell_type": { "type": "string", "enum": ["code", "markdown"] },
      "edit_mode": { "type": "string", "enum": ["replace", "insert", "delete"] }
    },
    "required": ["notebook_path", "new_source"],
    "additionalProperties": false
  }
}
```

### 12. TodoWrite (Legacy — replaced by TaskCreate/TaskUpdate in newer versions)

```json
{
  "name": "TodoWrite",
  "input_schema": {
    "type": "object",
    "properties": {
      "todos": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "content": { "type": "string", "minLength": 1 },
            "status": { "type": "string", "enum": ["pending", "in_progress", "completed"] },
            "id": { "type": "string" }
          },
          "required": ["content", "status", "id"],
          "additionalProperties": false
        },
        "description": "The updated todo list"
      }
    },
    "required": ["todos"],
    "additionalProperties": false
  }
}
```

### 13. ExitPlanMode

```json
{
  "name": "ExitPlanMode",
  "input_schema": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  }
}
```

### 14. AskUserQuestion

Parameters include `questions` array with `question`, `options` (label + description), and `multiSelect` boolean. Designed to show modal UI blocking agent loop until answered.

---

## Design Principles (from "Seeing Like an Agent" article)

1. **Shape tools to model abilities** — not to human mental models
2. **Progressive disclosure** — let agents discover context on demand rather than front-loading
3. **Revisit assumptions as models improve** — TodoWrite → TaskCreate/TaskUpdate evolution
4. **Structured tools > free-text output** — AskUserQuestion beats parsed markdown
5. **~20 tools total** — high bar to add new tools (each adds cognitive load)
6. **Subagents protect context** — delegate to keep main window clean
7. **Tool definitions cost ~11.4K tokens** — significant context budget

## Key Observations for Sunder Agent Design

- **Bash is the swiss army knife** — contains embedded instructions for git commits, PRs, etc.
- **Edit uses exact string matching** — not line numbers, not regex. Requires reading file first.
- **Task/subagents are stateless** — each invocation starts fresh, prompt must be complete
- **Permission model is binary** — tools either require permission or don't
- **No streaming tool results** — tools return complete results
- **Tools enforce file safety** — Write requires prior Read, Edit requires exact match
