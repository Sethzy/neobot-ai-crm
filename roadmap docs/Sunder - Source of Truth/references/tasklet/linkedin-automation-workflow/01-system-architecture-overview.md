# Tasklet LinkedIn Automation - System Architecture Overview

This document normalizes the reverse-engineered architecture for Tasklet-style LinkedIn browser automation.

## High-Level Flow

```text
Schedule Trigger
  -> Agent Orchestrator
  -> Computer Use Connection
  -> Remote VM + Browser Runtime
  -> LinkedIn Web UI
```

## Core Components

1. Schedule Trigger
- Starts an agent run using cron-like timing.
- Provides run context payload (trigger metadata + task intent).

2. Agent Orchestrator
- Receives trigger payload.
- Decides whether to initialize or reuse a browser control connection.
- Runs perception-action loops using screenshot-driven state detection.

3. Computer Use Connection
- Exposes browser-control primitives (for example: navigate, screenshot, click, type, scroll).
- Bridges tool calls to a remote execution environment.

4. Remote Runtime (VM/Container)
- Hosts browser process and input injection service.
- Isolates execution from user local machine.
- Can be ephemeral per run or semi-persistent across runs.

5. Target Surface (LinkedIn)
- UI-only interaction surface.
- State is inferred from pixels/OCR-like extraction, not DOM APIs.

## Data/Control Boundaries

- Trigger-to-agent: structured event payload.
- Agent-to-runtime: tool command RPC.
- Runtime-to-agent: screenshots and execution confirmations.
- Agent decision loop: deterministic policy + optional random delay functions.

## Operational Characteristic

The architecture is vision-first UI automation, not API automation.

