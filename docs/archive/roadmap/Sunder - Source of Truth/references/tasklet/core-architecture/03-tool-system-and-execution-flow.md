# Tool System and Execution Flow

## Tool Classes

1. Built-in tools
- Always available (filesystem, command execution, DB/task/trigger/contact/UI primitives).

2. Connection tools
- Namespaced by connection ID prefix.
- Activated/deactivated per connection with user approval.
- Provided by integrations or MCP-backed services.

## Execution Pipeline

1. LLM emits a structured tool call intent.
2. Orchestration validates + executes in the proper runtime boundary.
3. Tool result is returned as structured output.
4. LLM continues reasoning with the returned state.

## Important Behavior

- Tools are the only mutation path for external state.
- Output size from tools directly impacts token cost and reliability.
- Tool design quality strongly influences determinism.
