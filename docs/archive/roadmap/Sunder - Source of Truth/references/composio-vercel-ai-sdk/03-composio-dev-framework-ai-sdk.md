# Composio + Vercel AI SDK Framework Integration

> Source: https://composio.dev/toolkits/vercel/framework/ai-sdk
> Fetched: 2026-03-07

## Overview

Composio provides a Model Context Protocol (MCP) integration enabling AI agents to control Vercel accounts through natural language. The integration uses Composio's Tool Router to dynamically load tools via HTTP transport.

## Prerequisites

- Node.js and npm installed
- Composio account with API key
- OpenAI API key (or any supported LLM provider)

## Installation

```bash
npm install @ai-sdk/openai @ai-sdk/mcp @composio/core ai dotenv
```

## Environment Configuration

Create a `.env` file with:
```
OPENAI_API_KEY=your_key
COMPOSIO_API_KEY=your_key
COMPOSIO_USER_ID=your_user_id
```

## Core Implementation Pattern (MCP/Session Approach)

The integration follows this sequence:
1. Initialize Composio SDK with API credentials
2. Create a Tool Router session specifying toolkit(s)
3. Establish MCP client connection using HTTP transport with session authentication headers
4. Retrieve available tools from the MCP client
5. Use `streamText()` with `stopWhen: stepCountIs(N)` for real-time responses

### Key Code Structure

```typescript
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { createMCPClient } from '@ai-sdk/mcp';
import { streamText, stepCountIs } from 'ai';

const composio = new Composio({ provider: new VercelProvider() });

// Create session with tool router
const session = await composio.create(userID, { toolkits: ["gmail"] });

// Connect via MCP
const mcpClient = await createMCPClient({
  transport: { type: "http", url: session.mcp.url, headers: session.mcp.headers }
});

// Get tools and use with streamText
const tools = await mcpClient.tools();
const stream = streamText({
  model: openai('gpt-4'),
  tools,
  prompt: 'Fetch my latest email',
  stopWhen: stepCountIs(10),
  onStepFinish: (step) => {
    for (const toolCall of step.toolCalls) {
      console.log(`Tool: ${toolCall.toolName}`);
    }
  },
});
```

## Security Features

"All sensitive data such as tokens, keys, and configuration is fully encrypted at rest and in transit. Composio is SOC 2 Type 2 compliant..." — credentials are managed server-side, never exposed to the agent.
