# Claude Code Internal Tools — Complete Technical Reference

> **Sources:**
> - Primary: https://gist.github.com/bgauryy/0cdb9aa337d01ae5bd0c803943aa36bd (bgauryy, Oct 2025, Sonnet 4.5 era)
> - Cross-referenced: Live Claude Code Opus 4.6 system prompt (Mar 2026)
> - Cross-referenced: Context7 `/anthropics/claude-code` official docs
> - Previous version: x1xhlol/system-prompts-and-models-of-ai-tools (Aug 2025, Sonnet 4 era)
>
> **Version notes:** The tool set evolves across Claude Code versions. This document captures the most complete known state, noting where tools were renamed, added, or deprecated. JSON schemas are verbatim from the gist; TypeScript interfaces are derived. Where the live system prompt (Opus 4.6) differs, both are shown.

---

## Quick Index

| # | Tool | Category | Required Params | Description |
|---|------|----------|----------------|-------------|
| 1 | [Agent](#1-agent-subagent-launcher) | Orchestration | `description`, `prompt` | Launch autonomous subagents for complex tasks |
| 2 | [Bash](#2-bash) | Execution | `command` | Execute shell commands in persistent session |
| 3 | [BashOutput](#3-bashoutput) | Execution | `bash_id` | Retrieve output from background shells |
| 4 | [KillShell](#4-killshell) | Execution | `shell_id` | Terminate background bash shells |
| 5 | [Read](#5-read) | File Ops | `file_path` | Read file contents (text, images, PDFs, notebooks) |
| 6 | [Write](#6-write) | File Ops | `file_path`, `content` | Create or overwrite files |
| 7 | [Edit](#7-edit) | File Ops | `file_path`, `old_string`, `new_string` | Exact string replacement in files |
| 8 | [Glob](#8-glob) | Search | `pattern` | Fast file pattern matching |
| 9 | [Grep](#9-grep) | Search | `pattern` | Content search via ripgrep |
| 10 | [NotebookEdit](#10-notebookedit) | File Ops | `notebook_path`, `new_source` | Edit Jupyter notebook cells |
| 11 | [WebFetch](#11-webfetch) | Web | `url`, `prompt` | Fetch and analyze web content |
| 12 | [WebSearch](#12-websearch) | Web | `query` | Search the web with domain filtering |
| 13 | [AskUserQuestion](#13-askuserquestion) | Elicitation | `questions` | Ask structured multiple-choice questions |
| 14 | [TodoWrite](#14-todowrite) | Planning | `todos` | Create/manage structured task list |
| 15 | [ExitPlanMode](#15-exitplanmode) | Planning | `plan` | Exit planning mode after presenting plan |
| 16 | [Skill](#16-skill) | Orchestration | `skill` | Execute user-defined skills |
| 17 | [ToolSearch](#17-toolsearch) | Orchestration | `query` | Search for and load deferred/MCP tools |
| 18 | [getDiagnostics](#18-getdiagnostics) | IDE (VS Code only) | — | Get language diagnostics from VS Code |
| 19 | [executeCode](#19-executecode) | IDE (VS Code only) | `code` | Execute Python in Jupyter kernel |
| 20 | [ListMcpResourcesTool](#20-listmcpresourcestool) | MCP | — | List available MCP server resources |
| 21 | [ReadMcpResourceTool](#21-readmcpresourcetool) | MCP | `server`, `uri` | Read specific MCP server resource |

**Additional tools (observed in Opus 4.6, deferred/optional):**

| Tool | Category | Description |
|------|----------|-------------|
| TaskCreate | Task Tracking | Create a new task |
| TaskGet | Task Tracking | Retrieve task details |
| TaskList | Task Tracking | List all tasks |
| TaskUpdate | Task Tracking | Update task status |
| TaskOutput | Task Tracking | Get background task output |
| TaskStop | Task Tracking | Stop a running task |
| CronCreate | Scheduling | Create recurring task |
| CronDelete | Scheduling | Delete recurring task |
| CronList | Scheduling | List recurring tasks |
| EnterPlanMode | Planning | Enter planning mode |
| EnterWorktree | Git | Enter isolated git worktree |

---

## Full Tool Definitions

---

### 1. Agent (Subagent Launcher)

> **Name evolution:** Called `Task` in Sonnet 4/4.5 era → renamed to `Agent` in Opus 4.6.

**Purpose:** Launch autonomous sub-agents with specialized tool access for complex, multi-step tasks.

**JSON Schema:**
```json
{
  "name": "Agent",
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
      },
      "resume": {
        "type": "string",
        "description": "Optional agent ID to resume from. If provided, the agent will continue from the previous execution transcript."
      },
      "run_in_background": {
        "type": "boolean",
        "description": "Set to true to run this agent in the background. You will be notified when it completes."
      },
      "isolation": {
        "type": "string",
        "enum": ["worktree"],
        "description": "Isolation mode. 'worktree' creates a temporary git worktree so the agent works on an isolated copy of the repo."
      }
    },
    "required": ["description", "prompt"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface AgentTool {
  description: string;        // Short 3-5 word summary (required)
  prompt: string;             // Detailed task description (required)
  subagent_type?: string;     // Agent type (optional, defaults to general-purpose)
  resume?: string;            // Agent ID to resume from previous invocation
  run_in_background?: boolean; // Run in background, get notified on completion
  isolation?: "worktree";     // Run in isolated git worktree
}
```

**Available Agent Types and Tool Access:**

| Agent Type | Tools Available | Use Case |
|------------|---------------|----------|
| `general-purpose` | ALL tools (`*`) | Complex multi-step tasks, code search when unsure of match |
| `Explore` | Glob, Grep, Read, Bash | Fast codebase exploration (quick/medium/very thorough) |
| `Plan` | All except Agent, ExitPlanMode, Edit, Write, NotebookEdit | Design implementation plans |
| `claude-code-guide` | Glob, Grep, Read, WebFetch, WebSearch | Answer questions about Claude Code features |
| `code-simplifier` | ALL tools | Simplify and refine code for clarity |
| `code-reviewer` | ALL tools | Review completed work against plan and standards |
| `statusline-setup` | Read, Edit | Configure status line setting |
| `output-style-setup` | Read, Write, Edit, Glob, Grep | Create output style (Sonnet 4.5 era) |

**Key Behavioral Rules:**
- Launch multiple agents concurrently in a single message for parallel execution
- Each invocation is stateless — prompt must be self-contained
- Agent results are NOT visible to the user — summarize back
- Can resume agents using `resume` parameter with agent ID
- Use `isolation: "worktree"` for repo-modifying agents that shouldn't affect main tree
- When NOT to use: specific file reads (use Read), class definition searches (use Glob), searching within 2-3 files (use Read)

---

### 2. Bash

**Purpose:** Execute commands in a persistent shell session with state preservation.

**JSON Schema:**
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
      "description": {
        "type": "string",
        "description": "Clear, concise description of what this command does in active voice. For simple commands, keep it brief (5-10 words). For complex commands (piped commands, obscure flags), add enough context."
      },
      "timeout": {
        "type": "number",
        "description": "Optional timeout in milliseconds (max 600000)"
      },
      "run_in_background": {
        "type": "boolean",
        "description": "Set to true to run this command in the background. Use BashOutput to read the output later."
      },
      "dangerouslyDisableSandbox": {
        "type": "boolean",
        "description": "Set this to true to dangerously override sandbox mode and run commands without sandboxing."
      }
    },
    "required": ["command"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface BashTool {
  command: string;                    // Shell command to execute (required)
  description?: string;              // 5-10 word description of what it does
  timeout?: number;                  // Milliseconds, max 600000 (10 min), default 120000 (2 min)
  run_in_background?: boolean;       // Run in background (default: false)
  dangerouslyDisableSandbox?: boolean; // Override sandbox mode
}
```

**Operational Limits:**
- Default timeout: 120,000ms (2 minutes)
- Maximum timeout: 600,000ms (10 minutes)
- Output truncated at 30,000 characters

**Key Behavioral Rules:**
- Persistent shell session — working directory persists between commands
- NEVER use for file operations (cat, head, tail, grep, find, sed, awk, echo) — use dedicated tools
- Independent commands → multiple Bash calls in single message (parallel)
- Dependent commands → single Bash call with `&&` (sequential)
- Use `;` only when failure of earlier commands doesn't matter
- DO NOT use newlines to separate commands
- Prefer absolute paths over `cd`
- Never use `run_in_background` with `sleep`

**Git Safety Rules (embedded in tool description):**
- NEVER update git config
- NEVER run destructive git commands unless user explicitly requests
- NEVER skip hooks (`--no-verify`, `--no-gpg-sign`)
- NEVER force push to main/master
- NEVER use `-i` flag (interactive mode not supported)
- Always create NEW commits rather than amending (unless explicitly asked)
- Commit messages via HEREDOC format

---

### 3. BashOutput

**Purpose:** Retrieve incremental output from background shells.

**JSON Schema:**
```json
{
  "name": "BashOutput",
  "input_schema": {
    "type": "object",
    "properties": {
      "bash_id": {
        "type": "string",
        "description": "The ID of the background shell to retrieve output from"
      },
      "filter": {
        "type": "string",
        "description": "Optional regular expression to filter the output lines. Only lines matching this regex will be included in the result. Any lines that do not match will no longer be available to read."
      }
    },
    "required": ["bash_id"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface BashOutputTool {
  bash_id: string;   // ID of background shell (required)
  filter?: string;   // Regex to filter output lines (destructive — non-matching lines are lost)
}
```

**Key Behaviors:**
- Returns ONLY new output since last check (incremental)
- Non-blocking (returns immediately)
- Filter permanently removes non-matching lines — use with caution

---

### 4. KillShell

**Purpose:** Terminate background bash shells.

**JSON Schema:**
```json
{
  "name": "KillShell",
  "input_schema": {
    "type": "object",
    "properties": {
      "shell_id": {
        "type": "string",
        "description": "The ID of the background shell to kill"
      }
    },
    "required": ["shell_id"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface KillShellTool {
  shell_id: string;   // ID of shell to kill (required)
}
```

---

### 5. Read

**Purpose:** Read file contents from the local filesystem with multimodal support.

**JSON Schema:**
```json
{
  "name": "Read",
  "input_schema": {
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "The absolute path to the file to read"
      },
      "offset": {
        "type": "number",
        "description": "The line number to start reading from. Only provide if the file is too large to read at once"
      },
      "limit": {
        "type": "number",
        "description": "The number of lines to read. Only provide if the file is too large to read at once."
      },
      "pages": {
        "type": "string",
        "description": "Page range for PDF files (e.g., '1-5', '3', '10-20'). Only applicable to PDF files. Maximum 20 pages per request."
      }
    },
    "required": ["file_path"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface ReadTool {
  file_path: string;   // Absolute path to file (required)
  offset?: number;     // Starting line number
  limit?: number;      // Number of lines to read
  pages?: string;      // PDF page range (e.g., "1-5"). Max 20 pages per request.
}
```

**Operational Limits:**
- Default: first 2,000 lines
- Line truncation: 2,000 characters per line
- Output format: `cat -n` (spaces + line_number + tab + content)
- Line numbering: 1-indexed

**Multimodal Capabilities:**
- **Images (PNG, JPG):** Presented visually (Claude is multimodal)
- **PDF files:** Page-by-page. Large PDFs (>10 pages) MUST use `pages` parameter
- **Jupyter notebooks (.ipynb):** Returns all cells with outputs

**Key Behaviors:**
- Cannot read directories — use `ls` via Bash
- Must use absolute paths
- Empty files trigger system reminder warning
- Stateless — can be called multiple times

---

### 6. Write

**Purpose:** Create new files or completely overwrite existing files.

**JSON Schema:**
```json
{
  "name": "Write",
  "input_schema": {
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "The absolute path to the file to write (must be absolute, not relative)"
      },
      "content": {
        "type": "string",
        "description": "The content to write to the file"
      }
    },
    "required": ["file_path", "content"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface WriteTool {
  file_path: string;   // Absolute path (required)
  content: string;     // Complete file content (required)
}
```

**Safety Mechanisms:**
- **Read-before-write enforcement:** System fails if existing file wasn't read in current session
- Overwrites entire file (no partial updates)
- Prefer Edit tool for modifications to existing files
- Never create documentation files (*.md, README) unless explicitly requested

---

### 7. Edit

**Purpose:** Perform precise, surgical string replacements in files.

> **Schema evolution:** In the Sonnet 4 era, Edit used an `edits` array for batch operations. In Sonnet 4.5+ / Opus 4.6, it uses individual `old_string`/`new_string` parameters per call.

**JSON Schema (current — Sonnet 4.5+ / Opus 4.6):**
```json
{
  "name": "Edit",
  "input_schema": {
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "The absolute path to the file to modify"
      },
      "old_string": {
        "type": "string",
        "description": "The text to replace"
      },
      "new_string": {
        "type": "string",
        "description": "The text to replace it with (must be different from old_string)"
      },
      "replace_all": {
        "type": "boolean",
        "default": false,
        "description": "Replace all occurrences of old_string (default false)"
      }
    },
    "required": ["file_path", "old_string", "new_string"],
    "additionalProperties": false
  }
}
```

**JSON Schema (legacy — Sonnet 4 era, batch edits):**
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

**TypeScript Interface (current):**
```typescript
interface EditTool {
  file_path: string;       // Absolute path (required)
  old_string: string;      // Exact text to find (required)
  new_string: string;      // Replacement text, must differ from old_string (required)
  replace_all?: boolean;   // Replace all occurrences (default: false)
}
```

**String Matching Algorithm:**
- Uses exact string matching (not regex)
- **Uniqueness requirement:** `old_string` must appear exactly once (unless `replace_all=true`)
- Whitespace-sensitive — preserves exact indentation
- Operation fails if `old_string` is not unique (prevents ambiguous edits)

**Safety Mechanisms:**
- Read-before-edit enforcement (system validated)
- `new_string` must differ from `old_string`
- Never include line number prefix in old_string/new_string

---

### 8. Glob

**Purpose:** Fast file pattern matching for any codebase size.

**JSON Schema:**
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
        "description": "The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter 'undefined' or 'null' - simply omit it for the default behavior. Must be a valid directory path if provided."
      }
    },
    "required": ["pattern"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface GlobTool {
  pattern: string;   // Glob pattern (required)
  path?: string;     // Directory to search in (default: cwd)
}
```

**Pattern Syntax:**
- `*` — matches any characters except `/` (single directory level)
- `**` — matches any characters including `/` (recursive)
- `?` — matches exactly one character
- `{a,b}` — alternation
- `[abc]` — character class
- `[a-z]` — character range
- `[!abc]` — negated character class

**Key Behaviors:**
- Results sorted by modification time (most recent first)
- Omit `path` field for current working directory (never set to "undefined" or "null")
- Works efficiently with large codebases

---

### 9. Grep

**Purpose:** High-performance content search built on ripgrep.

**JSON Schema:**
```json
{
  "name": "Grep",
  "input_schema": {
    "type": "object",
    "properties": {
      "pattern": {
        "type": "string",
        "description": "The regular expression pattern to search for in file contents"
      },
      "path": {
        "type": "string",
        "description": "File or directory to search in (rg PATH). Defaults to current working directory."
      },
      "output_mode": {
        "type": "string",
        "enum": ["content", "files_with_matches", "count"],
        "description": "Output mode: 'content' shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), 'files_with_matches' shows file paths (supports head_limit), 'count' shows match counts (supports head_limit). Defaults to 'files_with_matches'."
      },
      "glob": {
        "type": "string",
        "description": "Glob pattern to filter files (e.g. '*.js', '*.{ts,tsx}') - maps to rg --glob"
      },
      "type": {
        "type": "string",
        "description": "File type to search (rg --type). Common types: js, py, rust, go, java, etc. More efficient than include for standard file types."
      },
      "-i": {
        "type": "boolean",
        "description": "Case insensitive search (rg -i)"
      },
      "-n": {
        "type": "boolean",
        "description": "Show line numbers in output (rg -n). Requires output_mode: 'content', ignored otherwise. Defaults to true."
      },
      "-A": {
        "type": "number",
        "description": "Number of lines to show after each match (rg -A). Requires output_mode: 'content', ignored otherwise."
      },
      "-B": {
        "type": "number",
        "description": "Number of lines to show before each match (rg -B). Requires output_mode: 'content', ignored otherwise."
      },
      "-C": {
        "type": "number",
        "description": "Alias for context."
      },
      "context": {
        "type": "number",
        "description": "Number of lines to show before and after each match (rg -C). Requires output_mode: 'content', ignored otherwise."
      },
      "multiline": {
        "type": "boolean",
        "description": "Enable multiline mode where . matches newlines and patterns can span lines (rg -U --multiline-dotall). Default: false."
      },
      "head_limit": {
        "type": "number",
        "description": "Limit output to first N lines/entries, equivalent to '| head -N'. Works across all output modes: content (limits output lines), files_with_matches (limits file paths), count (limits count entries). Defaults to 0 (unlimited)."
      },
      "offset": {
        "type": "number",
        "description": "Skip first N lines/entries before applying head_limit, equivalent to '| tail -n +N | head -N'. Works across all output modes. Defaults to 0."
      }
    },
    "required": ["pattern"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface GrepTool {
  pattern: string;                                         // Regex pattern (required)
  path?: string;                                           // File or directory (default: cwd)
  output_mode?: "content" | "files_with_matches" | "count"; // Default: "files_with_matches"
  glob?: string;                                           // Glob filter (e.g., "*.js")
  type?: string;                                           // File type filter (js, py, etc.)
  "-i"?: boolean;                                          // Case insensitive
  "-n"?: boolean;                                          // Show line numbers (default: true with content mode)
  "-A"?: number;                                           // Lines after match
  "-B"?: number;                                           // Lines before match
  "-C"?: number;                                           // Alias for context
  context?: number;                                        // Lines before and after match
  multiline?: boolean;                                     // Enable multiline mode (default: false)
  head_limit?: number;                                     // Limit output entries (default: 0 = unlimited)
  offset?: number;                                         // Skip first N entries (default: 0)
}
```

**Key Behaviors:**
- Built on **ripgrep** — NEVER invoke `grep` or `rg` as a Bash command
- Default output_mode: `"files_with_matches"`
- Context flags (`-A`, `-B`, `-C`) only work with `output_mode: "content"`
- Multiline mode disabled by default (patterns match single lines only)
- Pattern syntax: ripgrep (not grep) — literal braces need escaping (`interface\{\}`)
- For cross-line patterns: use `multiline: true` (e.g., `struct \{[\s\S]*?field`)

---

### 10. NotebookEdit

**Purpose:** Edit Jupyter notebook cells with replace, insert, or delete operations.

**JSON Schema:**
```json
{
  "name": "NotebookEdit",
  "input_schema": {
    "type": "object",
    "properties": {
      "notebook_path": {
        "type": "string",
        "description": "The absolute path to the Jupyter notebook file to edit (must be absolute, not relative)"
      },
      "new_source": {
        "type": "string",
        "description": "The new source for the cell"
      },
      "cell_id": {
        "type": "string",
        "description": "The ID of the cell to edit. When inserting a new cell, the new cell will be inserted after the cell with this ID, or at the beginning if not specified."
      },
      "cell_type": {
        "type": "string",
        "enum": ["code", "markdown"],
        "description": "The type of the cell (code or markdown). If not specified, defaults to current cell type. Required for edit_mode=insert."
      },
      "edit_mode": {
        "type": "string",
        "enum": ["replace", "insert", "delete"],
        "description": "The type of edit to make (replace, insert, delete). Defaults to replace."
      }
    },
    "required": ["notebook_path", "new_source"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface NotebookEditTool {
  notebook_path: string;                        // Absolute path to .ipynb file (required)
  new_source: string;                           // New cell content (required)
  cell_id?: string;                             // Cell ID to edit/insert after
  cell_type?: "code" | "markdown";              // Required for insert mode
  edit_mode?: "replace" | "insert" | "delete";  // Default: "replace"
}
```

**Key Behaviors:**
- Cell numbering is **0-indexed** (first cell = index 0)
- When inserting, new cell added after specified `cell_id`
- Must use absolute paths

---

### 11. WebFetch

**Purpose:** Fetch and analyze web content using AI processing.

**JSON Schema:**
```json
{
  "name": "WebFetch",
  "input_schema": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "format": "uri",
        "description": "The URL to fetch content from"
      },
      "prompt": {
        "type": "string",
        "description": "The prompt to run on the fetched content"
      }
    },
    "required": ["url", "prompt"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface WebFetchTool {
  url: string;      // Fully-formed valid URL (required)
  prompt: string;   // Prompt to process fetched content (required)
}
```

**Key Behaviors:**
- Converts HTML to markdown before processing
- Processes content with a **small, fast model** (not the main conversation model)
- 15-minute self-cleaning cache
- HTTP automatically upgraded to HTTPS
- Redirect handling: returns redirect URL, requires new request
- WILL FAIL for authenticated/private URLs — use specialized MCP tools instead
- If MCP web fetch tool available, prefer that over this tool

---

### 12. WebSearch

**Purpose:** Search the web for current information.

**JSON Schema:**
```json
{
  "name": "WebSearch",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "minLength": 2,
        "description": "The search query to use"
      },
      "allowed_domains": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Only include search results from these domains"
      },
      "blocked_domains": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Never include search results from these domains"
      }
    },
    "required": ["query"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface WebSearchTool {
  query: string;                // Search query, min 2 chars (required)
  allowed_domains?: string[];   // Whitelist domains
  blocked_domains?: string[];   // Blacklist domains
}
```

**Key Behaviors:**
- Minimum query length: 2 characters
- Only available in US
- Must account for current date in queries

---

### 13. AskUserQuestion

**Purpose:** Ask user structured multiple-choice questions.

**JSON Schema:**
```json
{
  "name": "AskUserQuestion",
  "input_schema": {
    "type": "object",
    "properties": {
      "questions": {
        "type": "array",
        "minItems": 1,
        "maxItems": 4,
        "description": "Questions to ask the user (1-4 questions)",
        "items": {
          "type": "object",
          "required": ["question", "header", "options", "multiSelect"],
          "additionalProperties": false,
          "properties": {
            "question": {
              "type": "string",
              "description": "The complete question to ask the user. Should be clear, specific, and end with a question mark."
            },
            "header": {
              "type": "string",
              "description": "Very short label displayed as a chip/tag (max 12 chars). Examples: 'Auth method', 'Library', 'Approach'."
            },
            "multiSelect": {
              "type": "boolean",
              "description": "Set to true to allow the user to select multiple options instead of just one."
            },
            "options": {
              "type": "array",
              "minItems": 2,
              "maxItems": 4,
              "description": "Available choices (2-4 options). There should be no 'Other' option — that is provided automatically.",
              "items": {
                "type": "object",
                "required": ["label", "description"],
                "additionalProperties": false,
                "properties": {
                  "label": {
                    "type": "string",
                    "description": "Display text (1-5 words, concise)"
                  },
                  "description": {
                    "type": "string",
                    "description": "Explanation of what this option means or implies"
                  }
                }
              }
            }
          }
        }
      },
      "answers": {
        "type": "object",
        "description": "User answers collected by the permission component",
        "additionalProperties": { "type": "string" }
      }
    },
    "required": ["questions"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface AskUserQuestionTool {
  questions: Question[];                  // 1-4 questions (required)
  answers?: Record<string, string>;       // Collected answers
}

interface Question {
  question: string;       // Complete question text (required)
  header: string;         // Short label, max 12 chars (required)
  multiSelect: boolean;   // Allow multiple selections (required)
  options: Option[];      // 2-4 choices (required)
}

interface Option {
  label: string;          // Display text, 1-5 words (required)
  description: string;    // Explanation of choice (required)
}
```

**Constraints:**
- 1-4 questions per call
- 2-4 options per question
- Header max 12 characters
- Option label: 1-5 words
- "Other" option automatically added (don't include it)
- `multiSelect` must be specified (not optional)

---

### 14. TodoWrite

**Purpose:** Create and manage structured task lists for current session.

> **Evolution note:** In newer versions (Opus 4.6), this is supplemented/replaced by `TaskCreate`, `TaskUpdate`, `TaskGet`, `TaskList`, `TaskOutput`, `TaskStop` tools for more granular task management.

**JSON Schema (Sonnet 4.5 era — with `activeForm`):**
```json
{
  "name": "TodoWrite",
  "input_schema": {
    "type": "object",
    "properties": {
      "todos": {
        "type": "array",
        "description": "The updated todo list",
        "items": {
          "type": "object",
          "required": ["content", "status", "activeForm"],
          "additionalProperties": false,
          "properties": {
            "content": {
              "type": "string",
              "minLength": 1,
              "description": "Imperative form: what needs to be done"
            },
            "status": {
              "type": "string",
              "enum": ["pending", "in_progress", "completed"],
              "description": "Task status"
            },
            "activeForm": {
              "type": "string",
              "minLength": 1,
              "description": "Present continuous form: what's being done"
            }
          }
        }
      }
    },
    "required": ["todos"],
    "additionalProperties": false
  }
}
```

**JSON Schema (Sonnet 4 era — with `id`):**
```json
{
  "name": "TodoWrite",
  "input_schema": {
    "type": "object",
    "properties": {
      "todos": {
        "type": "array",
        "description": "The updated todo list",
        "items": {
          "type": "object",
          "required": ["content", "status", "id"],
          "additionalProperties": false,
          "properties": {
            "content": { "type": "string", "minLength": 1 },
            "status": { "type": "string", "enum": ["pending", "in_progress", "completed"] },
            "id": { "type": "string" }
          }
        }
      }
    },
    "required": ["todos"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface (Sonnet 4.5 era):**
```typescript
interface TodoWriteTool {
  todos: TodoItem[];   // Full todo list state (required)
}

interface TodoItem {
  content: string;                                    // Imperative form (required)
  status: "pending" | "in_progress" | "completed";   // (required)
  activeForm: string;                                 // Present continuous form (required)
}
```

**Critical Rules:**
- Exactly ONE task must be `in_progress` at any time
- Mark tasks completed IMMEDIATELY after finishing — never batch completions
- Both `content` (imperative) and `activeForm` (present continuous) required
- Only use for 3+ step tasks — trivial tasks don't need tracking

---

### 15. ExitPlanMode

**Purpose:** Exit planning mode after presenting implementation strategy.

**JSON Schema:**
```json
{
  "name": "ExitPlanMode",
  "input_schema": {
    "type": "object",
    "properties": {
      "plan": {
        "type": "string",
        "description": "The plan you came up with, that you want to run by the user for approval. Supports markdown. The plan should be pretty concise."
      }
    },
    "required": ["plan"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface ExitPlanModeTool {
  plan: string;   // Implementation plan in markdown (required)
}
```

**Key Behaviors:**
- Only use for code-writing tasks, NOT research/exploration
- Resolve ambiguities with AskUserQuestion BEFORE exiting plan mode
- Plan supports markdown formatting

---

### 16. Skill

**Purpose:** Execute user-defined skills within the main conversation.

> **Schema evolution:** In Sonnet 4/4.5, used `command` parameter. In Opus 4.6, uses `skill` + `args`.

**JSON Schema (Opus 4.6 — current):**
```json
{
  "name": "Skill",
  "input_schema": {
    "type": "object",
    "properties": {
      "skill": {
        "type": "string",
        "description": "The skill name. E.g., 'commit', 'review-pr', or 'pdf'"
      },
      "args": {
        "type": "string",
        "description": "Optional arguments for the skill"
      }
    },
    "required": ["skill"],
    "additionalProperties": false
  }
}
```

**JSON Schema (Sonnet 4/4.5 — legacy):**
```json
{
  "name": "Skill",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "description": "The skill name (no arguments). E.g., 'pdf' or 'xlsx'"
      }
    },
    "required": ["command"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface (current):**
```typescript
interface SkillTool {
  skill: string;   // Skill name (required)
  args?: string;   // Optional arguments
}
```

**Key Behaviors:**
- Only use skills listed in available skills
- Do not invoke a skill that is already running
- Do not use for built-in CLI commands (/help, /clear, etc.)
- Skill prompt expands in next message

---

### 17. ToolSearch

**Purpose:** Search for and load deferred/MCP tools before calling them.

> **Evolution note:** Previously called `MCPSearch` in some versions.

**JSON Schema:**
```json
{
  "name": "ToolSearch",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Query to find deferred tools. Use 'select:<tool_name>' for direct selection, or keywords to search."
      },
      "max_results": {
        "type": "number",
        "default": 5,
        "description": "Maximum number of results to return (default: 5)"
      }
    },
    "required": ["query", "max_results"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface ToolSearchTool {
  query: string;         // Keyword search OR "select:<tool_name>" (required)
  max_results?: number;  // Max results (default: 5)
}
```

**Query Modes:**
1. **Keyword search:** `"slack message"` → find tools for slack messaging (returns up to 5)
2. **Direct selection:** `"select:mcp__slack__read_channel"` → load specific tool
3. **Multi-select:** `"select:Read,Edit,Grep"` → load multiple tools
4. **Required keyword:** `"+linear create issue"` → only tools from "linear"

**Critical Rule:** Deferred tools MUST be loaded via ToolSearch BEFORE calling them directly.

---

### 18. getDiagnostics

**Purpose:** Get language diagnostics from VS Code. (VS Code / IDE integration only — not available in terminal CLI.)

**JSON Schema:**
```json
{
  "name": "getDiagnostics",
  "input_schema": {
    "type": "object",
    "properties": {
      "uri": {
        "type": "string",
        "description": "Optional file URI to get diagnostics for. If not provided, gets diagnostics for all files."
      }
    },
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface GetDiagnosticsTool {
  uri?: string;   // File URI (optional — omit for all files)
}
```

---

### 19. executeCode

**Purpose:** Execute Python code in Jupyter kernel. (VS Code / IDE integration only.)

**JSON Schema:**
```json
{
  "name": "executeCode",
  "input_schema": {
    "type": "object",
    "properties": {
      "code": {
        "type": "string",
        "description": "The code to be executed on the kernel."
      }
    },
    "required": ["code"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface ExecuteCodeTool {
  code: string;   // Python code to execute (required)
}
```

**Key Behaviors:**
- Executes in current Jupyter kernel
- State persists across calls (variables, imports)
- State cleared only on kernel restart
- Avoid modifying kernel state unless explicitly requested

---

### 20. ListMcpResourcesTool

**Purpose:** List available resources from MCP servers.

**JSON Schema:**
```json
{
  "name": "ListMcpResourcesTool",
  "input_schema": {
    "type": "object",
    "properties": {
      "server": {
        "type": "string",
        "description": "Optional: filter by server name"
      }
    },
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface ListMcpResourcesTool {
  server?: string;   // Filter by MCP server name
}
```

---

### 21. ReadMcpResourceTool

**Purpose:** Read a specific resource from an MCP server.

**JSON Schema:**
```json
{
  "name": "ReadMcpResourceTool",
  "input_schema": {
    "type": "object",
    "properties": {
      "server": {
        "type": "string",
        "description": "MCP server name"
      },
      "uri": {
        "type": "string",
        "description": "Resource URI"
      }
    },
    "required": ["server", "uri"],
    "additionalProperties": false
  }
}
```

**TypeScript Interface:**
```typescript
interface ReadMcpResourceTool {
  server: string;   // MCP server name (required)
  uri: string;      // Resource URI (required)
}
```

---

## Deprecated / Legacy Tools

### LS (removed in Opus 4.6 era)

Listed files and directories with ignore patterns. Replaced by Glob + Bash `ls`.

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

### SlashCommand (merged into Skill in Opus 4.6)

Executed custom slash commands from `.claude/commands/*.md`. In Opus 4.6, this functionality is handled by the Skill tool.

```json
{
  "name": "SlashCommand",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "description": "The slash command to execute with its arguments, e.g., '/review-pr 123'"
      }
    },
    "required": ["command"],
    "additionalProperties": false
  }
}
```

---

## Complete Implementation Summary

### Operational Limits

| Tool | Limit | Value |
|------|-------|-------|
| Read | Default lines | 2,000 |
| Read | Line truncation | 2,000 chars |
| Read | PDF pages per request | 20 max |
| Bash | Default timeout | 120,000ms (2 min) |
| Bash | Max timeout | 600,000ms (10 min) |
| Bash | Output truncation | 30,000 chars |
| WebFetch | Cache TTL | 15 minutes |
| WebSearch | Min query length | 2 chars |
| Grep | Default output_mode | `files_with_matches` |
| AskUserQuestion | Questions per call | 1-4 |
| AskUserQuestion | Options per question | 2-4 |
| AskUserQuestion | Header max length | 12 chars |
| TodoWrite | Tasks in_progress | Exactly 1 |

### Enforcement Mechanisms

| Rule | Enforced By |
|------|-------------|
| Write/Edit must Read file first | System (tool fails) |
| Edit `old_string` must be unique | System (tool fails unless `replace_all`) |
| Edit `new_string` must differ from `old_string` | System (tool fails) |
| Read requires absolute path | System (tool fails) |
| BashOutput filter is destructive | System (non-matching lines permanently lost) |
| Deferred tools must be loaded via ToolSearch first | System (tool call fails) |

### Tool Token Cost

The full tool definitions cost approximately **11,400-12,000 tokens** of context budget per conversation turn.

### Design Principles (from "Seeing Like an Agent" article)

1. **Shape tools to model abilities** — not to human mental models
2. **Progressive disclosure** — agents discover context on demand rather than front-loading
3. **Revisit assumptions as models improve** — TodoWrite → Task* evolution
4. **Structured tools > free-text output** — AskUserQuestion beats parsed markdown
5. **~20 tools total** — high bar to add new tools (each adds cognitive load)
6. **Subagents protect context** — delegate to keep main window clean
7. **Tool definitions cost ~11.4K tokens** — significant context budget
