# State Surfaces: System-Managed vs Agent-Managed

## System-Managed (Opaque)

1. Connections
- Holds OAuth/API credentials and connection metadata.
- Agent can discover/use connection tools but does not read raw secrets.

2. Triggers
- Stores schedule/webhook/event subscriptions.
- Agent can create/delete trigger instances through tool APIs.

3. Contact Methods
- Stores verified outbound message destinations (email/text).
- Controlled through explicit add/list tools.

## Agent-Managed (Transparent)

1. Filesystem (`/agent/home/`)
- Durable storage for scripts, configs, outputs, datasets.
- Fully mutable by agent via file tools.

2. Subagents (`/agent/subagents/`)
- Markdown-defined reusable workflows.
- Created/edited by parent agent and executed via `run_subagent`.

3. Task List
- In-memory visible task state for progress management.
- Managed through `manage_tasks`/`list_tasks`.

## Practical Boundary

Reliable automation depends on storing intent and operational state in agent-managed artifacts that future invocations can rediscover.
