# Tasklet Skills Files - Verbatim Capture

Captured from user-provided content. This file preserves wording and formatting as provided, including visible truncation/typos.

---

Skills

Here are all the skills files verbatim:

/agent/skills/system/README.md
Contains additional details and instructions for core system capabilities like connection
management.

/agent/skills/system/building-preview-apps/SKILL.md
---
name: building-preview-apps
description: Build Tasklet preview web apps that run inside the preview panel. Use when the user asks for an interactive app, UI prototype, or multi-file web preview that must load via the Tasklet preview bridge and interact with host tools or the agent.
---

# Building Preview Apps

Build a folder-based preview app under `/agent/home/apps/<app-name>/` that loads in Tasklet's preview panel. Apps can call host tools via `window.tasklet.runTool(...)` and send chat messages via `window.tasklet.sendMessageToAgent(...)`.

## Rules — READ EACH RULE CAREFULLY, THEY ARE ALL IMPORTANT

1. App folder must contain an `index.html`. Launch with `kind="app"` and `rootPath="/agent/home/apps/<app-name>"`.
2. Split code into separate files — `index.h, `app.jsx` (or `app.js` for plain JS), `styles.css`. Do not inline large scripts or styles.
3. External scripts/styles must use `https://cdnjs.cloudflare.com` only (CSP restriction).
4. Always validate `runTool` responses and throw on unexpected shapes — never use silent fallbacks. Uncaught errors and `console.error` both trigger an "AI Fix it" popup the user can click to report the bug to you.
5. `prompt()`, `confirm()`, and `alert()` are blocked by the iframe sandbox. Use in-page UI elements (modals, inputs, buttons) instead.
6. **Default stack: Tailwind CSS + React + Babel** (all from cdnjs.cloudflare.com). Use this unless the user asks for something different. Load them in `index.html`:
   ```html
   <link
     rel="stylesheet"
     href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css"
   />
   <script
     crossorigin
     src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"
   ></script>
   <script
     crossorigin
     src="https://cdnjsloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"
   ></script>
   <script
     crossorigin
     src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.9/babel.min.js"
   ></script>
Write app code in app.jsx and load it with <script type="text/babel" src="app.jsx"></script>. Keep all React code in a single app.jsx — Babel standalone doesn't support ES module imports between files. For very simple non-stateful apps, plain HTML/CSS/JS is acceptable. 7. Edit files partially, don't rewrite entirely. When fixing a bug or adding a feature to an existing app, use targeted edits to the specific functions or components that need changing. Do not rewrite the entire app.jsx from scratch — this is slow, error-prone, and risks losing working code. Read the file first, then edit only the relevant sections. 8. Never hardcode data from connections or tools into source files. Apps must fetch live data at runtime via runTool. For example, don't embed calendar events, emails, oords as constants in app.js — call the appropriate tool when the app loads and render the response. 9. Do NOT use localStorage, sessionStorage, IndexedDB, or cookies for persistence. The preview iframe's browser storage is scoped to the canvas subdomain and will be lost between sessions. For persisting app state, use one of these instead (in order of preference):
* SQL (preferred): window.tasklet.runTool('run_agent_memory_sql', { query }) — best for structured/queryable data.
* Disk: window.tasklet.runTool('write_file', { path: '/agent/home/apps/<app-name>/data.json', content: JSON.stringify(state) }) and read back with window.tasklet.runTool('read_file', { path: '/agent/home/apps/<app-name>/data.json' }) — suitable for simple config or blobs.
runTool is latent — build optimistic UIs
runTool calls go through the host bridge and are not instant. Every call has noticeable latency (hundreds of milliseconds to seconds). Your UI must account for this:
1. Optimistic updates: Apply state cely, before the runTool promise resolves. For example, when a user adds a todo, append it to the list instantly — don't wait for the SQL write to complete before updating the screen.
2. Async saves: Persist data in the background. Don't block user interaction while waiting for runTool to return.
3. Loading states: Show spinners or skeleton UI while initial data loads. After the first load, prefer optimistic updates over blocking the UI with loading indicators.
4. Graceful failure recovery: If an optimistic update's backing runTool call fails, roll back the optimistic state and show an error. Never silently swallow the failure — use console.error or throw so the "AI Fix it" popup can surface it.
5. Debounce frequent writes: If the user makes rapid changes (e.g. typing in a text field that auto-saves), debounce the runTool write calls rather than firing one per keystroke.
Anti-pattern — blocking UI on every write:
// BAD: UI freezes until SQL write completes
button.onclick = async () => {
  awERT INTO todos (text) VALUES ('${text}')`);
  const todos = await sqlQuery('SELECT * FROM todos ORDER BY id');
  render(todos);
};
Correct — optimistic update with background persist:
// GOOD: UI updates instantly, persists in background, rolls back on failure
button.onclick = () => {
  const optimisticTodo = { id: Date.now(), text, done: 0 };
  setTodos((prev) => [...prev, optimisticTodo]);
  sqlExec(`INSERT INTO todos (text) VALUES ('${text}')`)
    .then(() => sqlQuery('SELECT * FROM todos ORDER BY id'))
    .then(setTodos)
    .catch((err) => {
      setTodos((prev) => prev.filter((t) => t.id !== optimisticTodo.id));
      console.error('Failed to save todo:', err);
    });
};
runTool normalization — READ THIS FIRST
runTool in the browser does NOT return the same shape as calling a tool directly in conversation. The bridge normalizes every response:
* Single text block with JSON content → auto-parsed into the JS object. You get the object, not { content: "..." }.
* Multi-block or non-JSON → blocks array.
* Failure → throws an Error.
Example — read_file on a JSON file:
When you call read_file directly as a tool call, the result block contains: { "content": "[\"hello\"]" } (a JSON string). But when browser code calls window.tasklet.runTool('read_file', { path }), the bridge sees one text block with valid JSON, parses it, and returns ["hello"] directly — not { content: "[\"hello\"]" }.
This means you CANNOT predict runTool response shapes from your knowledge of tools. You must test every tool you plan to use (see Step 1 below).
Development Process — IMPORTANT, PAY ATTENTION
Step 1: Discover response shapes — DO NOT SKIP THIS
Before writing any app code, call each tool you plan to use directly (as a normal tool call in the conversation, NOT inside a preview app). Inspect the raw response — note exact field names, types, and nesting.
You must do this even for tools you "know" like read_file and write_file. Your knowledge of tool response shapes is based on direct toolchanges the shape. Skipping this step is the #1 cause of broken preview apps.
For tools that are hard to test safely (write/mutate/delete), wrap every call with a validation check that throws if the response shape doesn't match expectations — console.error and uncaught exceptions automatically offer the user an "AI Fix it" button to send logs to the agent.
Step 2: Write validators
For each tool, write a validation function that checks the exact shape from Step 1. Throw descriptive errors on mismatch (include what you got vs expected). These throws trigger the error boundary so the user can report issues.
Step 3: Build the app
Only after Steps 1-2, build the UI. This ensures tool calls work on the first run and parsing errors surface immediately.
Bridge APIs
window.tasklet.runTool(toolName, args) → Promise<unknown>
Calls a host tool. See "runTool normalization" section above for how responses are transformed.
Connection-prefixed tools (e.g. conn_abc123__google_calendar_search_events) work with runhe full prefixed name exactly as it appears in your tool list.
window.tasklet.sendMessageToAgent(message) → Promise<void>
Sends a chat message to the agent. Fire-and-forget — resolves when the message is queued. This is NOT a tool call — it queues a message in the conversation.
Examples
Disk persistence helpers
Use these patterns for read_file and write_file via runTool. Do NOT wrap these in try/catch with fallback return values — let errors throw so the error boundary catches them.
// read_file via runTool returns the file content DIRECTLY (auto-parsed if JSON).
// It does NOT return { content: "..." } — the bridge strips the wrapper.
async function loadData(path) {
  try {
    const result = await window.tasklet.runTool('read_file', { path });
    // For a JSON file, result is already the parsed object/array — NOT { content: "..." }
    return result;
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      return null; // File doesn't exist yet
    }
    thunexpected errors — do NOT swallow them
  }
}

// write_file returns { ok: true } on success
async function saveData(path, data) {
  const result = await window.tasklet.runTool('write_file', {
    op: 'write',
    path,
    content: JSON.stringify(data, null, 2),
  });
  if (!result || result.ok !== true) {
    throw new Error('write_file failed: ' + JSON.stringify(result));
  }
}
SQL persistence helpers
run_agent_memory_sql returns different shapes depending on the query type:
* SELECT → returns an array of row objects directly, e.g. [{"id": 1, "text": "hello"}]
* INSERT/UPDATE/DELETE/CREATE → returns {"rowsAffected": N}
// SQL helper that handles both response shapes
// Use sqlQuery() for SELECT (returns rows), sqlExec() for writes (returns rowsAffected)
async function sqlQuery(query) {
  const result = await window.tasklet.runTool('run_agent_memory_sql', { query });
  if (!Array.isArray(result)) {
    throw new Error('Expected array from SELECT, got: ' + JSON.stringify(result));
  }
  returnsync function sqlExec(query) {
  const result = await window.tasklet.runTool('run_agent_memory_sql', { query });
  if (!result || typeof result !== 'object' || typeof result.rowsAffected !== 'number') {
    throw new Error('Expected {rowsAffected}, got: ' + JSON.stringify(result));
  }
  return result;
}
Todo App (Tailwind + React + SQL persistence, optimistic UI)
<!-- /agent/home/apps/todo-app/index.html -->
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Todo App</title>
    <link
      rel="stylesheet"
      href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css"
    />
    <script
      crossorigin
      src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"
    ></script>
    <script
      crossorigin
      src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"
    ></script>
    <script
      crossorigin
      src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.9/babel.min.js"
    ></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="text/babel" src="app.jsx"></script>
  </body>
</html>
// /agent/home/apps/todo-app/app.jsx

const { useState, useEffect, useCallback } = React;

async function sqlQuery(query) {
  const result = await window.tasklet.runTool('run_agent_memory_sql', { query });
  if (!Array.isArray(result)) {
    throw new Error('Expected array from SELECT, got: ' + JSON.stringify(result));
  }
  return result;
}

async function sqlExec(query) {
  const result = await window.tasklet.runTool('run_agent_memory_sql', { query });
  if (!result || typeof result !== 'object' || typeof result.rowsAffected !== 'number') {
    throw new Error('Expected {rowsAffected}, got: ' + JSON.stringify(result));
  }
  return result;
}

function App() {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sqlExec(
      'CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, done INTEGER DEFAULT 0)',
    )
      .then(() => sqlQuery('SELECT * FROM todos ORDER BY id'))
      .then(setTodos)
      .finally(() => setLoading(false));
  }, []);

  const addTodo = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    // Optimistic: add to UI immediately
    const optimisticTodo = { id: Date.now(), text, done: 0 };
    setTodos((prev) => [...prev, optimisticTodo]);
    setInput('');

    // Persist in background, then reconcile with real data
    sqlExec(`INSERT INTO todos (text) VALUES ('${text.replace(/'/g, "''")}')`)
      .then(() => sqlQuery('SELECT * FROM todos ORDER BY id'))
      .then(setTodos)
      .catch((err) => {
        // Roll back optimistic update on failure
        setTodos((prev) => prev.filter((t) => t.id !== optimisticTodo.id));
        console.error('Failed to add todo:', err);
      });
  }, [input]);

  const toggleTodo = useCallback((todo) => {
    // Optimistic: toggle in UI immediately
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, done: t.done ? 0 : 1 } : t)));

    // Persist in background
    sqlExec(`UPDATE todos SET done=${todo.done ? 0 : 1} WHERE id=${todo.id}`)
      .then(() => sqlQuery('SELECT * FROM todos ORDER BY id'))
      .then(setTodos)
      .catch((err) => {
        // Roll back on failure
        setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, done: todo.done } : t)));
        console.error('Failed to toggle todo:', err);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">Loading...</div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Todos</h2>
      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Add a todo..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTodo()}
        />
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          onClick={addTodo}
        >
          Add
        </button>
      </div>
      <ul className="space-y-2">
        {todos.map((t) => (
          <li
            key={t.id}
            className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-100 ${t.done ? 'line-through text-gray-400' : ''}`}
            onClick={() => toggleTodo(t)}
          >
            <span
              className={`w-5 h-5 border rounded flex items-center justify-center ${t.done ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300'}`}
            >
              {t.done ? '✓' : ''}
            </span>
            {t.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root'.render(<App />);
---

## /agent/skills/system/creating-connections/SKILL.md

```markdown
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

### 3. `type: 'direct_api'` - Direct API Connections

Connects to APIs via HTTP endpoints.

- **You MUST read /agent/skills/system/creating-connections/create-direct-api-connection.md before creating a direct API connection.**
- Never hallucinate an endpoint or URL.

### 4. `type: 'computer_use'` - Computer Use

Provisions a remote computer for browser-based or desktop UI-based tasks. Slow and expensive.

- Tell the user about this option when helpful, but prefer other types when possible
- Allows you to view and use websites and user interfaces
- Use this if the user specifically asks to use a computer or browser

## Guidelines

If the user asks what integrations, apps, or services you can connect to, do not try to enumerate a complete list. Indicate that you can connect to almost any service via thousands of integrations, direct API access, custom MCP servers, or a virtual computer.

**Remember to:**

- Verify an integration has the capabilities needed to complete the task before creating a connection
- Offer Direct HTTP, Custom MCP, or Computer use as connection options when there are no available pre-built integrations that can satisfy the user's request
```
