# Composio Official Examples (Vercel AI SDK + Connected Accounts)

> Source: Cloned repo `ComposioHQ/composio`
> Paths: `ts/examples/vercel/` + `ts/examples/connected-accounts/`

---

## 1. Basic Tool Usage — `ts/examples/vercel/src/ai.ts`

Direct `composio.tools.get()` pattern with execution modifiers.

```typescript
import { Composio } from '@composio/core';
import { generateText, ModelMessage, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { VercelProvider } from '@composio/vercel';
import { MessageRoles } from './types';

/**
 * Initialize the Composio SDK with the Vercel provider
 */
const composio = new Composio({
  provider: new VercelProvider(),
});

/**
 * Get the hacker news tool
 * Alternatively, you can use the `composio.getToolBySlug` method
 */
async function run() {
  const tools = await composio.tools.get('test-user-id', 'HACKERNEWS_GET_USER', {
    beforeExecute: ({ params, toolSlug }) => {
      console.log(`Executing ${toolSlug} with params:`, { params });
      return params;
    },
    afterExecute: ({ result, toolSlug }) => {
      console.log(`Executed ${toolSlug} with result:`, { result });
      return result;
    },
  });

  const messages: ModelMessage[] = [
    {
      role: MessageRoles.USER,
      content: 'Who is the user "pg" on hackernews?',
    },
  ];

  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    tools,
    messages,
    stopWhen: stepCountIs(5),
  });

  console.log(text);
}

run();
```

---

## 2. Streaming with streamText — `ts/examples/vercel/src/stream.ts`

```typescript
import { Composio } from '@composio/core';
import { stepCountIs, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { VercelProvider } from '@composio/vercel';

/**
 * Initialize the Composio SDK with the Vercel provider
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

const tools = await composio.tools.get('test-user-id', 'HACKERNEWS_GET_FRONTPAGE');
const stream = await streamText({
  model: openai('gpt-4o-mini'),
  tools,
  prompt: 'Summarize the front page of HackerNews',
  stopWhen: stepCountIs(5),
});

for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}
```

---

## 3. Tool Router / Session + MCP — `ts/examples/vercel/src/tool-router-ai.ts`

Session-based pattern with MCP client. **This is the pattern that uses meta-tools.**

```typescript
import { openai } from '@ai-sdk/openai';
import { createMCPClient } from "@ai-sdk/mcp"
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { stepCountIs, streamText } from 'ai';

// 1. Initialize Composio.
const composio = new Composio({
  provider: new VercelProvider(),
});

// 2. Create an MCP session
console.log('Creating toolrouter session...');
const session = await composio.create('default', {
  toolkits: ['gmail'],
  manageConnections: true,
  tools: {
    'gmail': {
      enable: ['GMAIL_FETCH_EMAILS'],
    }
  }
});

const { mcp, sessionId } = session;

console.log(JSON.stringify(mcp, null, 2));
console.log(`Toolrouter session created: ${sessionId}`);

// 3. Create an MCP client
console.log(`Connecting to MCP Server: ${mcp.url}`);
const mcpClient = await createMCPClient({
  transport: {
    type: 'http',
    url: mcp.url,
    headers: mcp.headers
  }
});

// 4. Retrieve tools.
console.log(`Retrieving tools...`);
const tools = await mcpClient.tools();
console.log(`${Object.values(tools).length} tools retrieved from MCP client`);
console.log(`Available tools: ${Object.keys(tools).join(', ')}`);

// 5. Pass tools to Vercel-specific Agent.
console.log(`Executing agent...`);
const stream = streamText({
  model: openai('gpt-5.2'),
  prompt: `Fetch my latest received email from Gmail and summarize it.`,
  stopWhen: stepCountIs(10),
  onStepFinish: (step) => {
    if (step.toolCalls.length > 0) {
      for (let i = 0; i < step.toolCalls.length; i++) {
        const toolCall = step.toolCalls[i];
        console.log(`Executed ${toolCall.toolName}`);
        // @ts-ignore
        const toolResult = step.toolResults?.[i];
        if (toolResult !== undefined) {
          console.log(`Result for ${toolCall.toolName}:`, toolResult);
        }
      }
    }
  },
  tools,
});

// 6. Execute the Vercel AI-specific Agent.
console.log(`Agent Response:`);
for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}

process.stdout.write('\n');

// 7. Close Vercel AI's MCP client.
await mcpClient.close();
```

---

## 4. ToolLoopAgent (AI SDK v6) — `ts/examples/vercel/src/tool-loop-agent.ts`

```typescript
import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent } from 'ai';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';

/**
 * This example demonstrates the new ToolLoopAgent class introduced in AI SDK v6,
 * which provides a production-ready implementation that handles the complete
 * tool execution loop automatically.
 *
 * See: https://vercel.com/blog/ai-sdk-6#toolloopagent.
 */

// 1. Initialize Composio with the Vercel provider
const composio = new Composio({
  provider: new VercelProvider(),
});

// 2. Get Composio tools for the agent
console.log('Fetching Composio tools...');
const tools = await composio.tools.get('test-user-id', 'HACKERNEWS_GET_USER', {
  beforeExecute: ({ params, toolSlug }) => {
    console.log(`Executing ${toolSlug}...`);
    return params;
  },
  afterExecute: ({ result, toolSlug }) => {
    console.log(`${toolSlug} completed`);
    return result;
  },
});
console.log(`Tools loaded: ${Object.keys(tools).join(', ')}`);

// 3. Create a ToolLoopAgent with Composio tools
const hackerNewsAgent = new ToolLoopAgent({
  model: openai('gpt-4o-mini'),
  instructions: `You are a helpful assistant that can look up information about Hacker News users.
When asked about a user, use the available tools to fetch their profile information.
Provide a concise summary of the user's profile including their karma, about section, and any other relevant details.`,
  tools,
});

// 4. Run the agent
console.log('Running agent...\n');
const result = await hackerNewsAgent.generate({
  prompt: 'Who is the user "pg" on Hacker News? Tell me about their profile.',
});

// 5. Display the result
console.log('Agent Response:');
console.log(result.text);
```

---

## 5. Connected Accounts — OAuth Flow — `ts/examples/connected-accounts/src/index.ts`

**The full OAuth flow: authConfig creation → initiate connection → redirect → wait → get tools.**

```typescript
import { AuthConfigTypes, Composio } from '@composio/core';

// Initialize Composio
// OpenAI Provider is automatically installed and initialized
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

/**
 * Create a new auth config
 */
const authConfig = await composio.authConfigs.create('github', {
  type: AuthConfigTypes.COMPOSIO_MANAGED,
  name: 'My GitHub Auth Config',
});

console.log(`Auth config created: ${authConfig.id}`);
console.log(`Creating a connection request`);

/**
 * Create a new connected account
 */
const ConnectionRequest = await composio.connectedAccounts.link('default', authConfig.id);

console.log(ConnectionRequest);

console.log(
  `Please visit the following URL to authorize the user: ${ConnectionRequest.redirectUrl}`
);
const connectedAccount = await ConnectionRequest.waitForConnection();

console.log(`Connected account created: ${connectedAccount.id}`);
console.log(connectedAccount);
console.log(`Getting the GitHub tools`);

const tools = await composio.tools.get('default', {
  toolkits: ['github'],
});

console.log(tools);

const authConfigDetails = await composio.authConfigs.get(authConfig.id);

console.log({ authConfigDetails });
```

---

## 6. Toolkit Authorize (Compound Flow) — `ts/examples/connected-accounts/src/toolkit-authorize.ts`

**Simplified OAuth using `toolkits.authorize()` — compound method that handles authConfig creation internally.**

```typescript
import { Composio } from '@composio/core';

// Initialize Composio
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

/**
 * This is a compound flow which will initiate a connection request
 * and wait for the user to authorize the toolkit
 */
const connectionRequest = await composio.toolkits.authorize('default', 'github');
const redirectUrl = connectionRequest.redirectUrl;

/**
 * If the redirectUrl is not null, it means that the user needs to visit
 * the following URL to authorize the toolkit
 */
if (redirectUrl) {
  console.log(`Please visit the following URL to authorize the toolkit: ${redirectUrl}`);
}
console.log('Waiting for connection...');

/**
 * This will wait for the user to authorize the toolkit and then return
 * the connected account. Optionally, you can pass a timeout.
 */
const connectedAccount = await connectionRequest.waitForConnection();
console.log(`Connected account created: ${connectedAccount.id}`);
console.log(connectedAccount);
```

---

## 7. Multiple Connected Accounts — `ts/examples/connected-accounts/src/multiple-connected-accounts.ts`

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const connectionRequest = await composio.connectedAccounts.initiate('default', 'ac_NSC2s9WqTE4n', {
  allowMultiple: true,
});

console.log(connectionRequest.redirectUrl);
```

---

## 8. Magic Flow Demo — `ts/examples/connected-accounts/src/magic-flow-demo.ts`

**Full end-to-end: authorize → get tools → use with OpenAI.**

```typescript
import { Composio } from '@composio/core';
import { OpenAI } from 'openai';

const userId = 'default';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ------------------------------------------------------------
// 1. Authorize the user to GitHub
// ------------------------------------------------------------

const connectionRequest = await composio.toolkits.authorize(userId, 'github');
// Redirect the user to continue to auth flow
const redirectUrl = connectionRequest.redirectUrl;

console.log(`Redirect the user to ${redirectUrl}`);

// Wait for the user to connect the account / singin to GitHub
const connectedAccount = await connectionRequest.waitForConnection();

console.log(`Connected account created: ${JSON.stringify(connectedAccount, null, 2)}`);

// ------------------------------------------------------------
// 2. Get the GitHub tools
// ------------------------------------------------------------

const tools = await composio.tools.get(userId, {
  toolkits: ['github'],
});

// ------------------------------------------------------------
// 3. Use the Composio GitHub tools with OpenAI
// ------------------------------------------------------------
const task = 'Star the composio repository on GitHub';
const messages: OpenAI.ChatCompletionMessageParam[] = [
  { role: 'system', content: 'You are a helpful assistant that can help with tasks.' },
  { role: 'user', content: task },
];

const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages,
  tools: tools,
  tool_choice: 'auto',
});

console.log(`Response: ${JSON.stringify(response, null, 2)}`);
```

---

## Key Takeaways from Examples

1. **Two initialization patterns**:
   - `composio.tools.get(userId, ...)` — direct tool fetching, you manage connections
   - `composio.create(userId, { ... })` — session/tool-router, meta-tools manage connections

2. **OAuth has three API layers** (from simplest to most control):
   - `composio.toolkits.authorize(userId, 'github')` — compound, handles authConfig internally
   - `composio.connectedAccounts.link(userId, authConfigId)` — you manage authConfig
   - `composio.connectedAccounts.initiate(userId, authConfigId, opts)` — full control, `allowMultiple`

3. **All examples use `VercelProvider`** for AI SDK integration
4. **`stopWhen: stepCountIs(N)`** is the standard way to limit tool-calling steps
5. **Execution modifiers** (`beforeExecute`/`afterExecute`) are used for logging/tracing
