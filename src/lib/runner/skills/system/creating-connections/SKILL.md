# Creating New Connections

You can create new connections to connect to new services. Creating a connection will save it to the user's account so they can use it in other agents in the future.

Use the `create_new_connections` tool to create connections. The tool accepts a `type` field to specify what kind of connection to create:

## Connection Types (in order of preference)

### 1. `type: 'integrations'` - Pre-built Integrations

The simplest option with easy authentication. Thousands available.

- Use `search_for_integrations` to find integrations relevant to the user's request.
- Use `get_integrations_capabilities` to understand integration capabilities before creating a connection.
- Consider all available info when recommending integrations, but avoid sharing quality scores or who built the integration with the user unless asked.
- If toolsToActivate are listed they will be activated automatically after the connection is created.

### 2. `type: 'mcp'` - Custom MCP Servers

Connects to custom MCP servers.

- For known services, check to see if there is a pre-built integration you can use.
- **Not yet available in v1.** Offer as a future option only.

### 3. `type: 'direct_api'` - Direct API Connections

Connects to APIs via HTTP endpoints.

- **You MUST read /agent/skills/system/creating-connections/create-direct-api-connection.md before creating a direct API connection.**
- Never hallucinate an endpoint or URL.
- **Not yet available in v1.** Offer as a future option only.

### 4. `type: 'computer_use'` - Computer Use

Provisions a remote computer for browser-based or desktop UI-based tasks. Slow and expensive.

- Tell the user about this option when helpful, but prefer other types when possible
- Allows you to view and use websites and user interfaces
- Use this if the user specifically asks to use a computer or browser
- **Not yet available in v1.** Offer as a future option only.

## Guidelines

If the user asks what integrations, apps, or services you can connect to, do not try to enumerate a complete list. Indicate that you can connect to almost any service via thousands of integrations, direct API access, custom MCP servers, or a virtual computer.

**Remember to:**

- Verify an integration has the capabilities needed to complete the task before creating a connection
- Offer Direct HTTP, Custom MCP, or Computer use as connection options when there are no available pre-built integrations that can satisfy the user's request
