# Nanobot Tool Infrastructure Analysis

> **Repository:** `/Users/sethlim/Documents/nanobot`
> **Language:** Python 3.14, fully async (asyncio)
> **LLM Routing:** LiteLLM (multi-provider: Anthropic, OpenAI, DeepSeek, Gemini, Moonshot, MiniMax, OpenRouter, vLLM, etc.)
> **Architecture:** Message bus + agent loop + tool registry. Channels (Telegram, WhatsApp, Discord, Slack, Email, DingTalk, Feishu, QQ, Mochat) publish to an async bus; the agent loop consumes, calls LLM, executes tools, and publishes responses back.

---

## 1. Tool Definition Schema

**File:** `nanobot/agent/tools/base.py`

Every tool extends the abstract `Tool` class. The contract is four abstract members (`name`, `description`, `parameters`, `execute`) plus a built-in `to_schema()` method that converts to OpenAI function-calling format, and a `validate_params()` method for recursive JSON Schema validation.

### Full `Tool` ABC Class (verbatim)

```python
"""Base class for agent tools."""

from abc import ABC, abstractmethod
from typing import Any


class Tool(ABC):
    """
    Abstract base class for agent tools.

    Tools are capabilities that the agent can use to interact with
    the environment, such as reading files, executing commands, etc.
    """

    _TYPE_MAP = {
        "string": str,
        "integer": int,
        "number": (int, float),
        "boolean": bool,
        "array": list,
        "object": dict,
    }

    @property
    @abstractmethod
    def name(self) -> str:
        """Tool name used in function calls."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Description of what the tool does."""
        pass

    @property
    @abstractmethod
    def parameters(self) -> dict[str, Any]:
        """JSON Schema for tool parameters."""
        pass

    @abstractmethod
    async def execute(self, **kwargs: Any) -> str:
        """
        Execute the tool with given parameters.

        Args:
            **kwargs: Tool-specific parameters.

        Returns:
            String result of the tool execution.
        """
        pass

    def validate_params(self, params: dict[str, Any]) -> list[str]:
        """Validate tool parameters against JSON schema. Returns error list (empty if valid)."""
        schema = self.parameters or {}
        if schema.get("type", "object") != "object":
            raise ValueError(f"Schema must be object type, got {schema.get('type')!r}")
        return self._validate(params, {**schema, "type": "object"}, "")

    def _validate(self, val: Any, schema: dict[str, Any], path: str) -> list[str]:
        t, label = schema.get("type"), path or "parameter"
        if t in self._TYPE_MAP and not isinstance(val, self._TYPE_MAP[t]):
            return [f"{label} should be {t}"]

        errors = []
        if "enum" in schema and val not in schema["enum"]:
            errors.append(f"{label} must be one of {schema['enum']}")
        if t in ("integer", "number"):
            if "minimum" in schema and val < schema["minimum"]:
                errors.append(f"{label} must be >= {schema['minimum']}")
            if "maximum" in schema and val > schema["maximum"]:
                errors.append(f"{label} must be <= {schema['maximum']}")
        if t == "string":
            if "minLength" in schema and len(val) < schema["minLength"]:
                errors.append(f"{label} must be at least {schema['minLength']} chars")
            if "maxLength" in schema and len(val) > schema["maxLength"]:
                errors.append(f"{label} must be at most {schema['maxLength']} chars")
        if t == "object":
            props = schema.get("properties", {})
            for k in schema.get("required", []):
                if k not in val:
                    errors.append(f"missing required {path + '.' + k if path else k}")
            for k, v in val.items():
                if k in props:
                    errors.extend(self._validate(v, props[k], path + '.' + k if path else k))
        if t == "array" and "items" in schema:
            for i, item in enumerate(val):
                errors.extend(self._validate(item, schema["items"], f"{path}[{i}]" if path else f"[{i}]"))
        return errors

    def to_schema(self) -> dict[str, Any]:
        """Convert tool to OpenAI function schema format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            }
        }
```

### Key Design Points

- **Return type is always `str`.** Every tool returns a string result -- no typed result objects, no structured outputs. This simplifies the agent loop since tool results are always appended as string content.
- **Parameters are raw JSON Schema dicts.** No Pydantic or Zod wrapper. The `parameters` property returns a `dict[str, Any]` that is a valid JSON Schema object.
- **Built-in validation.** `validate_params()` recursively validates types, enums, ranges, string lengths, required fields, nested objects, and arrays -- all without external libraries.
- **`to_schema()` produces OpenAI function-calling format.** The output is `{"type": "function", "function": {"name": ..., "description": ..., "parameters": ...}}` -- compatible with any LLM that uses OpenAI tool calling format (which LiteLLM normalizes to).

---

## 2. Tool Registration

**File:** `nanobot/agent/tools/registry.py`

### Full `ToolRegistry` Class (verbatim)

```python
"""Tool registry for dynamic tool management."""

from typing import Any

from nanobot.agent.tools.base import Tool


class ToolRegistry:
    """
    Registry for agent tools.

    Allows dynamic registration and execution of tools.
    """

    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        """Register a tool."""
        self._tools[tool.name] = tool

    def unregister(self, name: str) -> None:
        """Unregister a tool by name."""
        self._tools.pop(name, None)

    def get(self, name: str) -> Tool | None:
        """Get a tool by name."""
        return self._tools.get(name)

    def has(self, name: str) -> bool:
        """Check if a tool is registered."""
        return name in self._tools

    def get_definitions(self) -> list[dict[str, Any]]:
        """Get all tool definitions in OpenAI format."""
        return [tool.to_schema() for tool in self._tools.values()]

    async def execute(self, name: str, params: dict[str, Any]) -> str:
        """
        Execute a tool by name with given parameters.

        Args:
            name: Tool name.
            params: Tool parameters.

        Returns:
            Tool execution result as string.

        Raises:
            KeyError: If tool not found.
        """
        tool = self._tools.get(name)
        if not tool:
            return f"Error: Tool '{name}' not found"

        try:
            errors = tool.validate_params(params)
            if errors:
                return f"Error: Invalid parameters for tool '{name}': " + "; ".join(errors)
            return await tool.execute(**params)
        except Exception as e:
            return f"Error executing {name}: {str(e)}"

    @property
    def tool_names(self) -> list[str]:
        """Get list of registered tool names."""
        return list(self._tools.keys())

    def __len__(self) -> int:
        return len(self._tools)

    def __contains__(self, name: str) -> bool:
        return name in self._tools
```

### Default Tool Registration in AgentLoop

**File:** `nanobot/agent/loop.py`, lines 93-123

When `AgentLoop.__init__()` is called, `_register_default_tools()` populates the registry with the standard tool set:

```python
def _register_default_tools(self) -> None:
    """Register the default set of tools."""
    # File tools (restrict to workspace if configured)
    allowed_dir = self.workspace if self.restrict_to_workspace else None
    self.tools.register(ReadFileTool(allowed_dir=allowed_dir))
    self.tools.register(WriteFileTool(allowed_dir=allowed_dir))
    self.tools.register(EditFileTool(allowed_dir=allowed_dir))
    self.tools.register(ListDirTool(allowed_dir=allowed_dir))

    # Shell tool
    self.tools.register(ExecTool(
        working_dir=str(self.workspace),
        timeout=self.exec_config.timeout,
        restrict_to_workspace=self.restrict_to_workspace,
    ))

    # Web tools
    self.tools.register(WebSearchTool(api_key=self.brave_api_key))
    self.tools.register(WebFetchTool())

    # Message tool
    message_tool = MessageTool(send_callback=self.bus.publish_outbound)
    self.tools.register(message_tool)

    # Spawn tool (for subagents)
    spawn_tool = SpawnTool(manager=self.subagents)
    self.tools.register(spawn_tool)

    # Cron tool (for scheduling)
    if self.cron_service:
        self.tools.register(CronTool(self.cron_service))
```

This produces up to **10 default tools** (11 if cron is enabled):

| Tool Name | Class | Module |
|---|---|---|
| `read_file` | `ReadFileTool` | `tools/filesystem.py` |
| `write_file` | `WriteFileTool` | `tools/filesystem.py` |
| `edit_file` | `EditFileTool` | `tools/filesystem.py` |
| `list_dir` | `ListDirTool` | `tools/filesystem.py` |
| `exec` | `ExecTool` | `tools/shell.py` |
| `web_search` | `WebSearchTool` | `tools/web.py` |
| `web_fetch` | `WebFetchTool` | `tools/web.py` |
| `message` | `MessageTool` | `tools/message.py` |
| `spawn` | `SpawnTool` | `tools/spawn.py` |
| `cron` | `CronTool` | `tools/cron.py` |
| `mcp_{server}_{tool}` | `MCPToolWrapper` | `tools/mcp.py` (dynamically added) |

MCP tools are added lazily on first message via `_connect_mcp()`.

---

## 3. Tool Execution -- The Agent Loop Dispatch

**File:** `nanobot/agent/loop.py`, lines 149-205

The core agent loop is a `while` loop bounded by `max_iterations` (default 20). Each iteration calls the LLM, checks for tool calls, executes them, appends results, then loops back.

### Full `_run_agent_loop` Method (verbatim)

```python
async def _run_agent_loop(self, initial_messages: list[dict]) -> tuple[str | None, list[str]]:
    """
    Run the agent iteration loop.

    Args:
        initial_messages: Starting messages for the LLM conversation.

    Returns:
        Tuple of (final_content, list_of_tools_used).
    """
    messages = initial_messages
    iteration = 0
    final_content = None
    tools_used: list[str] = []

    while iteration < self.max_iterations:
        iteration += 1

        response = await self.provider.chat(
            messages=messages,
            tools=self.tools.get_definitions(),
            model=self.model,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
        )

        if response.has_tool_calls:
            tool_call_dicts = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.name,
                        "arguments": json.dumps(tc.arguments)
                    }
                }
                for tc in response.tool_calls
            ]
            messages = self.context.add_assistant_message(
                messages, response.content, tool_call_dicts,
                reasoning_content=response.reasoning_content,
            )

            for tool_call in response.tool_calls:
                tools_used.append(tool_call.name)
                args_str = json.dumps(tool_call.arguments, ensure_ascii=False)
                logger.info(f"Tool call: {tool_call.name}({args_str[:200]})")
                result = await self.tools.execute(tool_call.name, tool_call.arguments)
                messages = self.context.add_tool_result(
                    messages, tool_call.id, tool_call.name, result
                )
            messages.append({"role": "user", "content": "Reflect on the results and decide next steps."})
        else:
            final_content = response.content
            break

    return final_content, tools_used
```

### Execution Flow

1. **LLM call** via `provider.chat()` with full tool definitions
2. **Check `response.has_tool_calls`** -- if yes, enter tool execution
3. **Append assistant message** with tool_calls metadata to message history
4. **Execute each tool call sequentially** via `self.tools.execute(name, arguments)`
5. **Append tool result** as `{"role": "tool", "tool_call_id": ..., "name": ..., "content": ...}` message
6. **Inject reflection prompt** -- `"Reflect on the results and decide next steps."` -- as a user message after all tool results
7. **Loop back** to call LLM again with updated messages
8. **Break** when LLM responds without tool calls (final text response)

Key detail: tool calls within a single LLM response are executed **sequentially** (not in parallel), even though the LLM may return multiple tool calls in one response. The reflection prompt is injected only once after all tool results for that iteration.

### `ToolRegistry.execute()` Dispatch

```python
async def execute(self, name: str, params: dict[str, Any]) -> str:
    tool = self._tools.get(name)
    if not tool:
        return f"Error: Tool '{name}' not found"

    try:
        errors = tool.validate_params(params)
        if errors:
            return f"Error: Invalid parameters for tool '{name}': " + "; ".join(errors)
        return await tool.execute(**params)
    except Exception as e:
        return f"Error executing {name}: {str(e)}"
```

The pattern is:
1. Lookup by name in `_tools` dict
2. Validate parameters against JSON Schema
3. Call `tool.execute(**params)` -- params dict is spread as kwargs
4. Catch all exceptions and return as error string (never raises)

---

## 4. Tool Result Handling

### LLMResponse Dataclass

**File:** `nanobot/providers/base.py`, lines 8-28

```python
@dataclass
class ToolCallRequest:
    """A tool call request from the LLM."""
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class LLMResponse:
    """Response from an LLM provider."""
    content: str | None
    tool_calls: list[ToolCallRequest] = field(default_factory=list)
    finish_reason: str = "stop"
    usage: dict[str, int] = field(default_factory=dict)
    reasoning_content: str | None = None  # Kimi, DeepSeek-R1 etc.

    @property
    def has_tool_calls(self) -> bool:
        """Check if response contains tool calls."""
        return len(self.tool_calls) > 0
```

### How Tool Results Are Added to Message History

**File:** `nanobot/agent/context.py`, lines 182-242

The `ContextBuilder` provides two methods for building the message history during tool execution:

```python
def add_tool_result(
    self,
    messages: list[dict[str, Any]],
    tool_call_id: str,
    tool_name: str,
    result: str
) -> list[dict[str, Any]]:
    """Add a tool result to the message list."""
    messages.append({
        "role": "tool",
        "tool_call_id": tool_call_id,
        "name": tool_name,
        "content": result
    })
    return messages


def add_assistant_message(
    self,
    messages: list[dict[str, Any]],
    content: str | None,
    tool_calls: list[dict[str, Any]] | None = None,
    reasoning_content: str | None = None,
) -> list[dict[str, Any]]:
    """Add an assistant message to the message list."""
    msg: dict[str, Any] = {"role": "assistant"}

    # Omit empty content -- some backends reject empty text blocks
    if content:
        msg["content"] = content

    if tool_calls:
        msg["tool_calls"] = tool_calls

    # Include reasoning content when provided (required by some thinking models)
    if reasoning_content:
        msg["reasoning_content"] = reasoning_content

    messages.append(msg)
    return messages
```

The message history during a multi-turn tool execution looks like:

```
[system] System prompt with identity, bootstrap files, memory, skills
[user]   Conversation history entries...
[user]   Current message
[assistant] {content: "thinking...", tool_calls: [{id, name, arguments}]}
[tool]   {tool_call_id, name, content: "result string"}
[user]   "Reflect on the results and decide next steps."
[assistant] {content: null, tool_calls: [{id, name, arguments}]}
[tool]   {tool_call_id, name, content: "result string"}
[user]   "Reflect on the results and decide next steps."
[assistant] {content: "Final response to user"}
```

### Session Persistence of Tool Usage

After the agent loop completes, the final user message and assistant response are saved to the session. Tool usage is tracked in the session message metadata:

```python
# nanobot/agent/loop.py, lines 308-311
session.add_message("user", msg.content)
session.add_message("assistant", final_content,
                    tools_used=tools_used if tools_used else None)
self.sessions.save(session)
```

The `tools_used` list (e.g., `["web_search", "read_file", "exec"]`) is saved alongside the message for later memory consolidation.

---

## 5. Tool Categories & Organization

### 5.1 Filesystem Tools

**File:** `nanobot/agent/tools/filesystem.py`

Four tools, all accepting an optional `allowed_dir` for workspace restriction:

```python
def _resolve_path(path: str, allowed_dir: Path | None = None) -> Path:
    """Resolve path and optionally enforce directory restriction."""
    resolved = Path(path).expanduser().resolve()
    if allowed_dir and not str(resolved).startswith(str(allowed_dir.resolve())):
        raise PermissionError(f"Path {path} is outside allowed directory {allowed_dir}")
    return resolved
```

| Tool | Name | Parameters | Behavior |
|---|---|---|---|
| `ReadFileTool` | `read_file` | `path` | Read file contents, returns full text |
| `WriteFileTool` | `write_file` | `path`, `content` | Write content, auto-creates parent dirs |
| `EditFileTool` | `edit_file` | `path`, `old_text`, `new_text` | Find-and-replace (exactly 1 occurrence required) |
| `ListDirTool` | `list_dir` | `path` | List directory contents with file/folder icons |

The `EditFileTool` is notable for its safety check:

```python
async def execute(self, path: str, old_text: str, new_text: str, **kwargs: Any) -> str:
    # ...
    if old_text not in content:
        return f"Error: old_text not found in file. Make sure it matches exactly."

    # Count occurrences
    count = content.count(old_text)
    if count > 1:
        return f"Warning: old_text appears {count} times. Please provide more context to make it unique."

    new_content = content.replace(old_text, new_text, 1)
```

### 5.2 Shell Tool

**File:** `nanobot/agent/tools/shell.py`

Single `ExecTool` with deny-pattern safety guards, configurable timeout, and workspace restriction.

```python
class ExecTool(Tool):
    def __init__(
        self,
        timeout: int = 60,
        working_dir: str | None = None,
        deny_patterns: list[str] | None = None,
        allow_patterns: list[str] | None = None,
        restrict_to_workspace: bool = False,
    ):
        self.timeout = timeout
        self.working_dir = working_dir
        self.deny_patterns = deny_patterns or [
            r"\brm\s+-[rf]{1,2}\b",          # rm -r, rm -rf, rm -fr
            r"\bdel\s+/[fq]\b",              # del /f, del /q
            r"\brmdir\s+/s\b",               # rmdir /s
            r"\b(format|mkfs|diskpart)\b",   # disk operations
            r"\bdd\s+if=",                   # dd
            r">\s*/dev/sd",                  # write to disk
            r"\b(shutdown|reboot|poweroff)\b",  # system power
            r":\(\)\s*\{.*\};\s*:",          # fork bomb
        ]
        self.allow_patterns = allow_patterns or []
        self.restrict_to_workspace = restrict_to_workspace
```

**Safety guard logic** (`_guard_command`, lines 111-144):

```python
def _guard_command(self, command: str, cwd: str) -> str | None:
    """Best-effort safety guard for potentially destructive commands."""
    cmd = command.strip()
    lower = cmd.lower()

    for pattern in self.deny_patterns:
        if re.search(pattern, lower):
            return "Error: Command blocked by safety guard (dangerous pattern detected)"

    if self.allow_patterns:
        if not any(re.search(p, lower) for p in self.allow_patterns):
            return "Error: Command blocked by safety guard (not in allowlist)"

    if self.restrict_to_workspace:
        if "..\\" in cmd or "../" in cmd:
            return "Error: Command blocked by safety guard (path traversal detected)"

        cwd_path = Path(cwd).resolve()

        win_paths = re.findall(r"[A-Za-z]:\\[^\\\"']+", cmd)
        posix_paths = re.findall(r"(?:^|[\s|>])(/[^\s\"'>]+)", cmd)

        for raw in win_paths + posix_paths:
            try:
                p = Path(raw.strip()).resolve()
            except Exception:
                continue
            if p.is_absolute() and cwd_path not in p.parents and p != cwd_path:
                return "Error: Command blocked by safety guard (path outside working dir)"

    return None
```

**Execution** uses `asyncio.create_subprocess_shell` with timeout and output truncation (10,000 chars max):

```python
async def execute(self, command: str, working_dir: str | None = None, **kwargs: Any) -> str:
    cwd = working_dir or self.working_dir or os.getcwd()
    guard_error = self._guard_command(command, cwd)
    if guard_error:
        return guard_error

    try:
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=self.timeout
            )
        except asyncio.TimeoutError:
            process.kill()
            return f"Error: Command timed out after {self.timeout} seconds"

        # ... output assembly ...

        # Truncate very long output
        max_len = 10000
        if len(result) > max_len:
            result = result[:max_len] + f"\n... (truncated, {len(result) - max_len} more chars)"

        return result
```

### 5.3 Web Tools

**File:** `nanobot/agent/tools/web.py`

Two tools using `httpx` for async HTTP:

**`WebSearchTool`** -- Brave Search API:

```python
class WebSearchTool(Tool):
    name = "web_search"
    description = "Search the web. Returns titles, URLs, and snippets."
    parameters = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
            "count": {"type": "integer", "description": "Results (1-10)", "minimum": 1, "maximum": 10}
        },
        "required": ["query"]
    }
```

**`WebFetchTool`** -- URL content extraction with Readability:

```python
class WebFetchTool(Tool):
    name = "web_fetch"
    description = "Fetch URL and extract readable content (HTML -> markdown/text)."
    parameters = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL to fetch"},
            "extractMode": {"type": "string", "enum": ["markdown", "text"], "default": "markdown"},
            "maxChars": {"type": "integer", "minimum": 100}
        },
        "required": ["url"]
    }
```

Uses the `readability` library (Python port of Mozilla Readability) for HTML content extraction. URL validation is performed before fetching:

```python
def _validate_url(url: str) -> tuple[bool, str]:
    """Validate URL: must be http(s) with valid domain."""
    try:
        p = urlparse(url)
        if p.scheme not in ('http', 'https'):
            return False, f"Only http/https allowed, got '{p.scheme or 'none'}'"
        if not p.netloc:
            return False, "Missing domain"
        return True, ""
    except Exception as e:
        return False, str(e)
```

### 5.4 Messaging Tool

**File:** `nanobot/agent/tools/message.py`

Stateful tool that routes outbound messages through the message bus:

```python
class MessageTool(Tool):
    def __init__(
        self,
        send_callback: Callable[[OutboundMessage], Awaitable[None]] | None = None,
        default_channel: str = "",
        default_chat_id: str = ""
    ):
        self._send_callback = send_callback
        self._default_channel = default_channel
        self._default_chat_id = default_chat_id

    def set_context(self, channel: str, chat_id: str) -> None:
        """Set the current message context."""
        self._default_channel = channel
        self._default_chat_id = chat_id
```

The `set_context()` method is called on every inbound message so the agent knows which channel/chat to reply to. Supports optional media attachments (file paths).

### 5.5 Spawn Tool (Subagents)

**File:** `nanobot/agent/tools/spawn.py`

```python
class SpawnTool(Tool):
    def __init__(self, manager: "SubagentManager"):
        self._manager = manager
        self._origin_channel = "cli"
        self._origin_chat_id = "direct"

    def set_context(self, channel: str, chat_id: str) -> None:
        """Set the origin context for subagent announcements."""
        self._origin_channel = channel
        self._origin_chat_id = chat_id

    @property
    def name(self) -> str:
        return "spawn"

    @property
    def description(self) -> str:
        return (
            "Spawn a subagent to handle a task in the background. "
            "Use this for complex or time-consuming tasks that can run independently. "
            "The subagent will complete the task and report back when done."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "The task for the subagent to complete",
                },
                "label": {
                    "type": "string",
                    "description": "Optional short label for the task (for display)",
                },
            },
            "required": ["task"],
        }

    async def execute(self, task: str, label: str | None = None, **kwargs: Any) -> str:
        """Spawn a subagent to execute the given task."""
        return await self._manager.spawn(
            task=task,
            label=label,
            origin_channel=self._origin_channel,
            origin_chat_id=self._origin_chat_id,
        )
```

### 5.6 Cron Tool

**File:** `nanobot/agent/tools/cron.py`

Supports three schedule types: interval (`every_seconds`), cron expression (`cron_expr` with IANA timezone), and one-shot (`at` ISO datetime):

```python
@property
def parameters(self) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["add", "list", "remove"],
                "description": "Action to perform"
            },
            "message": {"type": "string", "description": "Reminder message (for add)"},
            "every_seconds": {"type": "integer", "description": "Interval in seconds (for recurring tasks)"},
            "cron_expr": {"type": "string", "description": "Cron expression like '0 9 * * *'"},
            "tz": {"type": "string", "description": "IANA timezone (e.g. 'America/Vancouver')"},
            "at": {"type": "string", "description": "ISO datetime for one-time execution"},
            "job_id": {"type": "string", "description": "Job ID (for remove)"}
        },
        "required": ["action"]
    }
```

The cron service itself (`nanobot/cron/service.py`) persists jobs to a JSON file, uses `croniter` for cron expression parsing, and arm/re-arms asyncio timers for execution.

### 5.7 MCP Tool Wrapper

**File:** `nanobot/agent/tools/mcp.py`

Wraps MCP server tools as native nanobot tools. Full file (verbatim):

```python
"""MCP client: connects to MCP servers and wraps their tools as native nanobot tools."""

from contextlib import AsyncExitStack
from typing import Any

from loguru import logger

from nanobot.agent.tools.base import Tool
from nanobot.agent.tools.registry import ToolRegistry


class MCPToolWrapper(Tool):
    """Wraps a single MCP server tool as a nanobot Tool."""

    def __init__(self, session, server_name: str, tool_def):
        self._session = session
        self._original_name = tool_def.name
        self._name = f"mcp_{server_name}_{tool_def.name}"
        self._description = tool_def.description or tool_def.name
        self._parameters = tool_def.inputSchema or {"type": "object", "properties": {}}

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    @property
    def parameters(self) -> dict[str, Any]:
        return self._parameters

    async def execute(self, **kwargs: Any) -> str:
        from mcp import types
        result = await self._session.call_tool(self._original_name, arguments=kwargs)
        parts = []
        for block in result.content:
            if isinstance(block, types.TextContent):
                parts.append(block.text)
            else:
                parts.append(str(block))
        return "\n".join(parts) or "(no output)"


async def connect_mcp_servers(
    mcp_servers: dict, registry: ToolRegistry, stack: AsyncExitStack
) -> None:
    """Connect to configured MCP servers and register their tools."""
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    for name, cfg in mcp_servers.items():
        try:
            if cfg.command:
                params = StdioServerParameters(
                    command=cfg.command, args=cfg.args, env=cfg.env or None
                )
                read, write = await stack.enter_async_context(stdio_client(params))
            elif cfg.url:
                from mcp.client.streamable_http import streamable_http_client
                read, write, _ = await stack.enter_async_context(
                    streamable_http_client(cfg.url)
                )
            else:
                logger.warning(f"MCP server '{name}': no command or url configured, skipping")
                continue

            session = await stack.enter_async_context(ClientSession(read, write))
            await session.initialize()

            tools = await session.list_tools()
            for tool_def in tools.tools:
                wrapper = MCPToolWrapper(session, name, tool_def)
                registry.register(wrapper)
                logger.debug(f"MCP: registered tool '{wrapper.name}' from server '{name}'")

            logger.info(f"MCP server '{name}': connected, {len(tools.tools)} tools registered")
        except Exception as e:
            logger.error(f"MCP server '{name}': failed to connect: {e}")
```

Key features:
- **Namespacing:** MCP tools are namespaced as `mcp_{server_name}_{tool_name}` to avoid collisions
- **Supports both stdio and HTTP:** Checks `cfg.command` (stdio) or `cfg.url` (streamable HTTP)
- **Lazy connection:** MCP servers are only connected on first actual message processing, not at boot
- **AsyncExitStack:** Manages the lifecycle of all MCP sessions cleanly

### MCP Configuration Schema

**File:** `nanobot/config/schema.py`, lines 253-259

```python
class MCPServerConfig(Base):
    """MCP server connection configuration (stdio or HTTP)."""

    command: str = ""  # Stdio: command to run (e.g. "npx")
    args: list[str] = Field(default_factory=list)  # Stdio: command arguments
    env: dict[str, str] = Field(default_factory=dict)  # Stdio: extra env vars
    url: str = ""  # HTTP: streamable HTTP endpoint URL
```

---

## 6. System Prompt & Tool Injection

**File:** `nanobot/agent/context.py`

### `ContextBuilder.build_system_prompt()` (verbatim)

```python
BOOTSTRAP_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"]

def build_system_prompt(self, skill_names: list[str] | None = None) -> str:
    """Build the system prompt from bootstrap files, memory, and skills."""
    parts = []

    # Core identity
    parts.append(self._get_identity())

    # Bootstrap files
    bootstrap = self._load_bootstrap_files()
    if bootstrap:
        parts.append(bootstrap)

    # Memory context
    memory = self.memory.get_memory_context()
    if memory:
        parts.append(f"# Memory\n\n{memory}")

    # Skills - progressive loading
    # 1. Always-loaded skills: include full content
    always_skills = self.skills.get_always_skills()
    if always_skills:
        always_content = self.skills.load_skills_for_context(always_skills)
        if always_content:
            parts.append(f"# Active Skills\n\n{always_content}")

    # 2. Available skills: only show summary (agent uses read_file to load)
    skills_summary = self.skills.build_skills_summary()
    if skills_summary:
        parts.append(f"""# Skills

The following skills extend your capabilities. To use a skill, read its SKILL.md file using the read_file tool.
Skills with available="false" need dependencies installed first - you can try installing them with apt/brew.

{skills_summary}""")

    return "\n\n---\n\n".join(parts)
```

### System Prompt Assembly Order

1. **Core identity** -- agent name, current time, runtime info, workspace paths, behavioral instructions
2. **Bootstrap files** -- `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `IDENTITY.md` from workspace root (if they exist)
3. **Long-term memory** -- `MEMORY.md` contents
4. **Always-loaded skills** -- Full content of skills marked `always: true`
5. **Skills summary** -- XML-formatted list of all available skills with descriptions and file paths (progressive loading -- agent reads full skill via `read_file` when needed)
6. **Session context** -- Channel and chat ID appended at the end

### How Tools Are Passed to the LLM

Tools are **not** injected into the system prompt text. Instead, they are passed as the `tools` parameter to the LLM `chat()` call:

```python
# nanobot/agent/loop.py, lines 167-173
response = await self.provider.chat(
    messages=messages,
    tools=self.tools.get_definitions(),  # <-- OpenAI function-calling format
    model=self.model,
    temperature=self.temperature,
    max_tokens=self.max_tokens,
)
```

`self.tools.get_definitions()` calls `to_schema()` on every registered tool, producing the standard OpenAI tools array:

```python
# registry.py
def get_definitions(self) -> list[dict[str, Any]]:
    return [tool.to_schema() for tool in self._tools.values()]
```

### `build_messages()` -- Full Message Assembly

```python
def build_messages(
    self,
    history: list[dict[str, Any]],
    current_message: str,
    skill_names: list[str] | None = None,
    media: list[str] | None = None,
    channel: str | None = None,
    chat_id: str | None = None,
) -> list[dict[str, Any]]:
    messages = []

    # System prompt
    system_prompt = self.build_system_prompt(skill_names)
    if channel and chat_id:
        system_prompt += f"\n\n## Current Session\nChannel: {channel}\nChat ID: {chat_id}"
    messages.append({"role": "system", "content": system_prompt})

    # History
    messages.extend(history)

    # Current message (with optional image attachments)
    user_content = self._build_user_content(current_message, media)
    messages.append({"role": "user", "content": user_content})

    return messages
```

Media attachments (images from channels) are base64-encoded and sent as multimodal content blocks:

```python
def _build_user_content(self, text: str, media: list[str] | None) -> str | list[dict[str, Any]]:
    if not media:
        return text

    images = []
    for path in media:
        p = Path(path)
        mime, _ = mimetypes.guess_type(path)
        if not p.is_file() or not mime or not mime.startswith("image/"):
            continue
        b64 = base64.b64encode(p.read_bytes()).decode()
        images.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})

    if not images:
        return text
    return images + [{"type": "text", "text": text}]
```

---

## 7. Error Handling

### Parameter Validation

The `Tool.validate_params()` method performs recursive JSON Schema validation before tool execution. Validation errors are returned as strings and never raise exceptions:

```python
# registry.py
errors = tool.validate_params(params)
if errors:
    return f"Error: Invalid parameters for tool '{name}': " + "; ".join(errors)
```

Validated constraints include:
- Type checking (string, integer, number, boolean, array, object)
- Enum validation
- Numeric range (minimum/maximum)
- String length (minLength/maxLength)
- Required fields
- Nested object and array item validation

### Shell Command Guards

The `ExecTool._guard_command()` method provides three layers of defense:

1. **Deny patterns** -- Regex-based blocklist for destructive commands (`rm -rf`, `dd`, `format`, `shutdown`, fork bombs, etc.)
2. **Allow patterns** -- Optional allowlist mode (if configured, only matching commands are allowed)
3. **Workspace restriction** -- When `restrict_to_workspace=True`, blocks path traversal (`../`) and absolute paths outside the working directory

### Filesystem Workspace Restriction

All filesystem tools use `_resolve_path()` to enforce workspace boundaries:

```python
def _resolve_path(path: str, allowed_dir: Path | None = None) -> Path:
    resolved = Path(path).expanduser().resolve()
    if allowed_dir and not str(resolved).startswith(str(allowed_dir.resolve())):
        raise PermissionError(f"Path {path} is outside allowed directory {allowed_dir}")
    return resolved
```

### Global Exception Handling

Every tool execution is wrapped in a try/except in `ToolRegistry.execute()`:

```python
try:
    errors = tool.validate_params(params)
    if errors:
        return f"Error: Invalid parameters for tool '{name}': " + "; ".join(errors)
    return await tool.execute(**params)
except Exception as e:
    return f"Error executing {name}: {str(e)}"
```

The agent loop itself also catches errors at the message processing level:

```python
# loop.py, lines 219-229
try:
    response = await self._process_message(msg)
    if response:
        await self.bus.publish_outbound(response)
except Exception as e:
    logger.error(f"Error processing message: {e}")
    await self.bus.publish_outbound(OutboundMessage(
        channel=msg.channel,
        chat_id=msg.chat_id,
        content=f"Sorry, I encountered an error: {str(e)}"
    ))
```

### LLM Error Recovery

LLM call failures are caught in the provider and returned as error content rather than raising:

```python
# litellm_provider.py, lines 159-167
try:
    response = await acompletion(**kwargs)
    return self._parse_response(response)
except Exception as e:
    return LLMResponse(
        content=f"Error calling LLM: {str(e)}",
        finish_reason="error",
    )
```

### Malformed Tool Arguments

LiteLLM provider uses `json_repair` to handle malformed JSON from LLMs:

```python
# litellm_provider.py, lines 178-180
args = tc.function.arguments
if isinstance(args, str):
    args = json_repair.loads(args)
```

---

## 8. Unique Patterns

### 8.1 Stateful Tools with `set_context()`

Three tools maintain mutable state that is updated per-message via `set_context()`:

**File:** `nanobot/agent/loop.py`, lines 135-147

```python
def _set_tool_context(self, channel: str, chat_id: str) -> None:
    """Update context for all tools that need routing info."""
    if message_tool := self.tools.get("message"):
        if isinstance(message_tool, MessageTool):
            message_tool.set_context(channel, chat_id)

    if spawn_tool := self.tools.get("spawn"):
        if isinstance(spawn_tool, SpawnTool):
            spawn_tool.set_context(channel, chat_id)

    if cron_tool := self.tools.get("cron"):
        if isinstance(cron_tool, CronTool):
            cron_tool.set_context(channel, chat_id)
```

This is called before every agent loop run so that `message`, `spawn`, and `cron` tools know which channel/chat to route to without the LLM having to specify it.

### 8.2 Subagent Isolation

**File:** `nanobot/agent/subagent.py`

Subagents are intentionally limited compared to the main agent:

```python
# subagent.py, lines 103-116 -- Subagent gets a REDUCED tool set
# Build subagent tools (no message tool, no spawn tool)
tools = ToolRegistry()
allowed_dir = self.workspace if self.restrict_to_workspace else None
tools.register(ReadFileTool(allowed_dir=allowed_dir))
tools.register(WriteFileTool(allowed_dir=allowed_dir))
tools.register(EditFileTool(allowed_dir=allowed_dir))
tools.register(ListDirTool(allowed_dir=allowed_dir))
tools.register(ExecTool(
    working_dir=str(self.workspace),
    timeout=self.exec_config.timeout,
    restrict_to_workspace=self.restrict_to_workspace,
))
tools.register(WebSearchTool(api_key=self.brave_api_key))
tools.register(WebFetchTool())
```

**What subagents CAN do:** Read/write/edit files, execute shell commands, search/fetch web
**What subagents CANNOT do:** Send messages to users, spawn other subagents, access cron, access MCP tools, access main conversation history

The subagent system prompt explicitly states these limitations:

```python
def _build_subagent_prompt(self, task: str) -> str:
    return f"""# Subagent
...
## What You Cannot Do
- Send messages directly to users (no message tool available)
- Spawn other subagents
- Access the main agent's conversation history
...
"""
```

### Subagent Result Announcement

When a subagent completes, it publishes back to the main agent via the message bus as a "system" channel message:

```python
# subagent.py, lines 207-215
msg = InboundMessage(
    channel="system",
    sender_id="subagent",
    chat_id=f"{origin['channel']}:{origin['chat_id']}",
    content=announce_content,
)

await self.bus.publish_inbound(msg)
```

The main agent loop picks this up as a system message, processes it through its own LLM loop, and sends the summarized result to the user.

### 8.3 Progressive Skill Loading

**File:** `nanobot/agent/skills.py`

Skills are NOT all loaded into the system prompt. Instead:

1. **Always-on skills** (`always: true` in frontmatter) -- full content injected into system prompt
2. **Available skills** -- only an XML summary with name, description, file path, and availability is injected

```python
def build_skills_summary(self) -> str:
    lines = ["<skills>"]
    for s in all_skills:
        name = escape_xml(s["name"])
        path = s["path"]
        desc = escape_xml(self._get_skill_description(s["name"]))
        skill_meta = self._get_skill_meta(s["name"])
        available = self._check_requirements(skill_meta)

        lines.append(f"  <skill available=\"{str(available).lower()}\">")
        lines.append(f"    <name>{name}</name>")
        lines.append(f"    <description>{desc}</description>")
        lines.append(f"    <location>{path}</location>")

        if not available:
            missing = self._get_missing_requirements(skill_meta)
            if missing:
                lines.append(f"    <requires>{escape_xml(missing)}</requires>")

        lines.append(f"  </skill>")
    lines.append("</skills>")
    return "\n".join(lines)
```

The system prompt instructs the agent: *"To use a skill, read its SKILL.md file using the read_file tool."* -- so the agent loads skills on-demand during conversation.

Skills can declare requirements (CLI binaries, environment variables) that are checked at listing time:

```python
def _check_requirements(self, skill_meta: dict) -> bool:
    requires = skill_meta.get("requires", {})
    for b in requires.get("bins", []):
        if not shutil.which(b):
            return False
    for env in requires.get("env", []):
        if not os.environ.get(env):
            return False
    return True
```

### 8.4 Multi-Provider LLM via LiteLLM

**File:** `nanobot/providers/litellm_provider.py`

Nanobot supports **15+ LLM providers** through a single `LiteLLMProvider` class backed by a provider registry:

```python
class LiteLLMProvider(LLMProvider):
    """
    LLM provider using LiteLLM for multi-provider support.

    Supports OpenRouter, Anthropic, OpenAI, Gemini, MiniMax, and many other providers through
    a unified interface.  Provider-specific logic is driven by the registry
    (see providers/registry.py) -- no if-elif chains needed here.
    """
```

The **provider registry** (`nanobot/providers/registry.py`) is a tuple of `ProviderSpec` dataclasses that defines all provider metadata:

```python
@dataclass(frozen=True)
class ProviderSpec:
    name: str                       # config field name
    keywords: tuple[str, ...]       # model-name keywords for matching
    env_key: str                    # LiteLLM env var
    display_name: str = ""
    litellm_prefix: str = ""        # model prefix for LiteLLM routing
    skip_prefixes: tuple[str, ...] = ()
    env_extras: tuple[tuple[str, str], ...] = ()
    is_gateway: bool = False        # routes any model (OpenRouter, AiHubMix)
    is_local: bool = False          # local deployment (vLLM, Ollama)
    detect_by_key_prefix: str = ""  # match api_key prefix
    detect_by_base_keyword: str = ""
    default_api_base: str = ""
    strip_model_prefix: bool = False
    model_overrides: tuple[tuple[str, dict[str, Any]], ...] = ()
    is_oauth: bool = False
    is_direct: bool = False
```

Supported providers include: Custom (OpenAI-compatible), OpenRouter, AiHubMix, SiliconFlow, Anthropic, OpenAI, OpenAI Codex (OAuth), GitHub Copilot (OAuth), DeepSeek, Gemini, Zhipu AI, DashScope (Qwen), Moonshot (Kimi), MiniMax, vLLM/Local, and Groq.

Model routing logic:
1. **Gateway detection** -- by config key name, API key prefix (`sk-or-` for OpenRouter), or URL keyword
2. **Model name matching** -- keywords in the model name (e.g., `"claude"` matches Anthropic)
3. **Prefix application** -- LiteLLM-specific prefixes are applied automatically
4. **Per-model overrides** -- e.g., Kimi K2.5 forces `temperature: 1.0`

### 8.5 Async Message Bus Architecture

**File:** `nanobot/bus/queue.py`

The entire system is decoupled through an async message bus:

```python
class MessageBus:
    def __init__(self):
        self.inbound: asyncio.Queue[InboundMessage] = asyncio.Queue()
        self.outbound: asyncio.Queue[OutboundMessage] = asyncio.Queue()
        self._outbound_subscribers: dict[str, list[Callable[[OutboundMessage], Awaitable[None]]]] = {}
```

Channels (Telegram, WhatsApp, etc.) push `InboundMessage` to the bus. The agent loop consumes from the inbound queue, processes, and pushes `OutboundMessage` to the outbound queue. The outbound dispatcher routes messages back to the correct channel subscriber.

### 8.6 LLM-Driven Memory Consolidation

**File:** `nanobot/agent/loop.py`, lines 363-446

When the conversation exceeds `memory_window` messages (default 50), older messages are summarized by the LLM into two persistent files:

- **`MEMORY.md`** -- Long-term facts (user preferences, project context, technical decisions)
- **`HISTORY.md`** -- Grep-searchable chronological log of conversation summaries

```python
prompt = f"""You are a memory consolidation agent. Process this conversation and return a JSON object with exactly two keys:

1. "history_entry": A paragraph (2-5 sentences) summarizing the key events/decisions/topics.
2. "memory_update": The updated long-term memory content. Add any new facts: user location, preferences, personal info, habits, project context, technical decisions, tools/services used.

## Current Long-term Memory
{current_memory or "(empty)"}

## Conversation to Process
{conversation}

Respond with ONLY valid JSON, no markdown fences."""
```

### 8.7 Reasoning Content Support

The system explicitly supports thinking/reasoning models (DeepSeek-R1, Kimi K2.5, etc.) by preserving `reasoning_content` in the message history:

```python
# context.py
if reasoning_content:
    msg["reasoning_content"] = reasoning_content

# base.py
@dataclass
class LLMResponse:
    reasoning_content: str | None = None  # Kimi, DeepSeek-R1 etc.
```

### 8.8 Multi-Channel Architecture

**File:** `nanobot/config/schema.py`

The configuration schema supports 9 chat channels simultaneously:

```python
class ChannelsConfig(Base):
    whatsapp: WhatsAppConfig       # via bridge (WebSocket)
    telegram: TelegramConfig       # Bot API
    discord: DiscordConfig         # Gateway WebSocket
    feishu: FeishuConfig           # Lark WebSocket
    mochat: MochatConfig           # Socket.IO
    dingtalk: DingTalkConfig       # Stream mode
    email: EmailConfig             # IMAP/SMTP
    slack: SlackConfig             # Socket Mode
    qq: QQConfig                   # botpy SDK
```

Each channel implements `BaseChannel` (`nanobot/channels/base.py`) with `start()`, `stop()`, `send()`, and `is_allowed()` methods:

```python
class BaseChannel(ABC):
    name: str = "base"

    def __init__(self, config: Any, bus: MessageBus):
        self.config = config
        self.bus = bus

    @abstractmethod
    async def start(self) -> None: ...

    @abstractmethod
    async def stop(self) -> None: ...

    @abstractmethod
    async def send(self, msg: OutboundMessage) -> None: ...

    def is_allowed(self, sender_id: str) -> bool:
        allow_list = getattr(self.config, "allow_from", [])
        if not allow_list:
            return True
        # ... allowlist check ...
```

### 8.9 JSON Repair for LLM Output

Both the main agent loop and the LiteLLM provider use `json_repair` to handle malformed JSON from LLMs:

```python
# litellm_provider.py -- parsing tool call arguments
import json_repair
args = json_repair.loads(args)

# loop.py -- parsing memory consolidation output
result = json_repair.loads(text)
```

This is critical for reliability with models that sometimes produce broken JSON in function call arguments.

---

## Summary: Architecture Comparison Points

| Aspect | Nanobot Approach |
|---|---|
| **Tool Definition** | ABC with `name`, `description`, `parameters` (JSON Schema dict), `execute(**kwargs) -> str` |
| **Tool Registration** | `ToolRegistry` dict-based, `register(tool)` / `unregister(name)` / `get(name)` |
| **Tool Execution** | `registry.execute(name, params)` -- validate, then `tool.execute(**params)` |
| **Result Format** | Always `str` -- no typed results |
| **Error Strategy** | Never raises -- all errors returned as `"Error: ..."` strings |
| **LLM Integration** | Tools passed as `tools` parameter to `provider.chat()` (OpenAI format) |
| **Tool Injection** | Via LLM function-calling API, NOT in system prompt text |
| **Subagent Isolation** | Reduced tool set (no message, no spawn, no cron, no MCP) |
| **Statefulness** | `set_context(channel, chat_id)` on message/spawn/cron tools per request |
| **MCP Support** | Lazy connection, wraps MCP tools as native `Tool` instances, namespaced |
| **Provider Support** | 15+ providers via LiteLLM with registry-driven routing |
| **Skill Loading** | Progressive: always-on skills in prompt, others as XML summary (agent reads on demand) |
| **Memory** | LLM-driven consolidation to MEMORY.md (facts) + HISTORY.md (grep log) |
| **Scheduling** | Built-in cron service with interval/cron-expr/one-shot scheduling |
| **Safety** | Regex deny-patterns for shell, workspace path restriction, URL validation |
| **Channels** | 9 chat platforms via async message bus with per-channel allowlists |
| **Max Iterations** | 20 (configurable) per agent loop run |
| **Reflection Injection** | After tool results: `"Reflect on the results and decide next steps."` |
