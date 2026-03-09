# Creating Direct API Connections

## Overview

You can connect directly to HTTP APIs of external services. To create a connection, you must complete the following steps:

1. Research the API thoroughly
2. Verify the base URL and endpoint paths
3. Determine authentication requirements
4. Create test cases
5. Write notes for future use
6. Call the tool to present a secure credential form

### Step 1: Research the API

- Search for official API documentation
- Find example requests and curl commands (these show the correct paths)
- Identify ALL available endpoints - don't stop on the first couple
- Verify versioning requirements (e.g., /v1, /api/v2)
- If docs conflict on paths, do deeper research or ask the user
- Identify required user inputs (API keys, usernames, passwords, etc.)

### Step 2: Verify Base URL and Paths

- Base URL format: no trailing slash, no path segments (e.g., `https://api.example.com`)
- Be extremely careful to find the correct base URL - if unsure, ask the user
- For services with dynamic/custom base URLs, ask the user
- Verify endpoint paths include version prefixes (e.g., /v1/users) unless the base URL is already versioned
- Check both the base URL and individual endpoint paths for version prefixes

### Step 3: Determine Authentication

Identify which auth method the API uses and prepare the `authConfig` object. Common types:

- `bearer` for token auth (OpenAI, GitHub)
- `header` for API key auth (many services)
- `basic` for username/password
- `query-parameter` for auth via URL query parameters
- `custom-oauth` for OAuth2 with token refresh (use this instead of bearer when tokens expire)
- `none` for public APIs

Each auth field should include helpful labels, placeholders showing format, and descriptions of where users can find these values.

**Important**: Never ask users to enter credentials in conversation. The tool presents a secure UI form.

See **Auth Config Schema** below.

### Step 4: Create Test Cases

Create 1-3 test cases to verify the connection works. For REST APIs, provide a single GET test case.

Test cases must:

- Use GET method (you need a VERY good reason to use POST/PUT/PATCH/DELETE)
- Return quickly (< 5 seconds)
- Cost no money/credits
- Have no side effects
- Never purposefully fail

If GET is impossible, provide a detailed `reasonIAmDoingThisDangerousThing` (50+ chars) explaining:

- Why a modifying method is necessary to test THE AUTHENTICATION
- Why a GET test is not sufficient
- That you explicitly looked for NON-MODIFYING endpoints

See **Test Case Schema** below.

### Step 5: Write Notes

Write notes for future agents using this connection. Assume auth is configured and tested. Include:

- Links to official documentation
- Useful endpoints discovered
- API quirks or requirements
- Rate limits or usage considerations

Notes should be incredibly accurate. Do not start with a markdown heading - jump right into content.

### Step 6: Call the Tool

Use `create_new_connection` with `type: 'direct_api'`:

- Construct the `authConfig` object based on the Auth Config Schema below
- Construct the `testCases` array based on the Test Case Schema below
- Make the tool call

This tool presents the user with a custom UI form to securely enter their credentials and confirm the connection. Once the tool call succeeds, the user has provided valid credentials. These credentials are automatically added to subsequent HTTP requests, so you can immediately proceed to making HTTP calls without additional setup.

## Auth Config Schema

Each auth field supports UI hints (all optional, but try to set all when available):

- `label`: Human-readable field name
- `placeholder`: Example value format
- `value`: Pre-filled value (if known)
- `description`: What this field is and where to find it
- `learnMore`: `{ title, markdown }` for detailed help popup with step-by-step instructions on finding credentials in the service's UI

Example:

```json
{
  "label": "API Key",
  "placeholder": "sk-...",
  "description": "Find this in your account dashboard",
  "learnMore": {
    "title": "How to get your API key",
    "markdown": "1. Go to [example.com/settings](https://example.com/settings)\n2. Click 'API Keys'\n3. Click 'Create new key'\n4. Copy the key (it won't be shown again)"
  }
}
```

### type: 'none'

No authentication required.

```json
{ "type": "none" }
```

### type: 'header'

Custom header authentication (API key in header).

```json
{
  "type": "header",
  "headerName": { "label": "Header Name", "value": "X-API-Key" },
  "headerValue": { "label": "API Key", "placeholder": "sk-..." }
}
```

### type: 'bearer'

Bearer token authentication (common for OpenAI, GitHub).

```json
{
  "type": "bearer",
  "token": {
    "label": "API Token",
    "placeholder": "sk-...",
    "description": "Find this in your dashboard"
  }
}
```

### type: 'basic'

HTTP Basic authentication.

```json
{
  "type": "basic",
  "username": { "label": "Username", "placeholder": "user@example.com" },
  "password": { "label": "Password", "placeholder": "..." }
}
```

### type: 'query-parameter'

Authentication via URL query parameters.

```json
{
  "type": "query-parameter",
  "queryParameters": [
    { "name": { "value": "api_key" }, "value": { "label": "API Key", "placeholder": "..." } }
  ]
}
```

### type: 'custom-oauth'

OAuth2 authentication. Scopes and additionalParams fields are optional. Use space-separated values for scopes.

```json
{
  "type": "custom-oauth",
  "clientId": { "label": "Client ID", "placeholder": "..." },
  "clientSecret": { "label": "Client Secret", "placeholder": "..." },
  "authUrl": { "value": "https://..." },
  "tokenUrl": { "value": "https://..." },
  "scopes": {
    "label": "Scopes",
    "value": "read write",
    "description": "Space-separated list"
  },
  "additionalParams": {
    "label": "Additional OAuth Parameters",
    "placeholder": "access_type=offline",
    "description": "Extra parameters for the auth URL in query string format"
  }
}
```

## Test Case Schema

```json
{
  "id": "unique-id",
  "name": "Test connection",
  "method": "GET",
  "path": "/v1/endpoint",
  "verificationStatement": "I verified this endpoint exists in the official docs and is read-only. I explored the entire API documentation and found all endpoints, choosing this as the fastest way to verify authentication."
}
```

Fields:

- `id`: Unique identifier string
- `name`: Human-readable test name
- `method`: Either `"GET"` or `{ "method": "POST"|"PUT"|"PATCH"|"DELETE", "reasonIAmDoingThisDangerousThing": "..." }`
- `path`: Endpoint path - be extremely careful to get this right, include version prefix (e.g., /v1/users) unless base URL is already versioned
- `verificationStatement`: **Displayed to user**. Explain what you verified and why this test is appropriate. Must state that you explored the entire API documentation and found all endpoints.
- `description`: Optional description
- `requestBody`: Optional raw request body string
- `extraHeaders`: Optional additional headers object (cannot include blocked headers; Content-Type is added automatically)
