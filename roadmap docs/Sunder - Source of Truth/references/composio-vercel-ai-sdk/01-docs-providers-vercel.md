# Composio Vercel AI SDK Provider

> Source: https://docs.composio.dev/docs/providers/vercel
> Fetched: 2026-03-07

## Overview

The Vercel AI SDK provider integrates Composio tools into Vercel's tool format with built-in execution capability, eliminating the need for manual agentic loops.

## Installation

```bash
npm install @composio/core @composio/vercel ai @ai-sdk/anthropic
```

## Environment Configuration

Set these credentials in your `.env` file:
- `COMPOSIO_API_KEY`: Obtain from [Settings](https://platform.composio.dev/?next_page=/settings)
- `ANTHROPIC_API_KEY`: Get your key from [Anthropic's console](https://console.anthropic.com/settings/keys)

## Key Implementation Details

The provider features an **agentic architecture** where tools include built-in `execute` functions. This allows the AI SDK to automatically handle tool invocations via the [`stopWhen`](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) mechanism.

## Code Example

```typescript
import { anthropic } from "@ai-sdk/anthropic";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { generateText, stepCountIs } from "ai";

const composio = new Composio({ provider: new VercelProvider() });
const session = await composio.create("user_123");
const tools = await session.tools();

const { text } = await generateText({
  model: anthropic("claude-opus-4-6"),
  tools,
  prompt: "Send an email to john@example.com...",
  stopWhen: stepCountIs(10),
});
```

This workflow creates a user session, retrieves available tools, and passes them directly to the language model for autonomous execution.
