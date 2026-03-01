# Building Preview Apps Skill

Source: `/agent/skills/system/building-preview-apps/SKILL.md`

## Intent

Defines how to build Tasklet preview-panel apps under `/agent/home/apps/<app-name>/` that can call host tools and message the agent.

## Operational Rules (Normalized)

1. App structure and launch
- App root must include `index.html`.
- Launch in preview with `kind="app"` and matching `rootPath`.

2. File layout
- Split into separate files (`index.html`, `app.jsx`/`app.js`, `styles.css`).
- Avoid inlined large scripts/styles.

3. CSP restrictions
- External dependencies must come from `https://cdnjs.cloudflare.com`.

4. Error handling contract
- Validate every `runTool` response shape.
- Throw on shape mismatch; avoid silent fallbacks.
- Surface failures via uncaught errors or `console.error`.

5. UI constraints
- `prompt`/`confirm`/`alert` unavailable in sandboxed iframe.
- Build in-page UI controls instead.

6. Default tech stack
- Tailwind + React + Babel from cdnjs.
- Keep React code in a single `app.jsx` when using Babel standalone.

7. Editing policy
- Prefer targeted edits over full-file rewrites for existing apps.

8. Data policy
- Never hardcode tool/connection data in source.
- Fetch runtime data through `window.tasklet.runTool(...)`.

9. Persistence policy
- Do not use local/session storage, IndexedDB, or cookies.
- Persist via `run_agent_memory_sql` or file tools.

10. Latency-aware UX
- Use optimistic updates.
- Persist asynchronously.
- Roll back optimistic state on failure.
- Debounce frequent writes.

11. Development process mandate
- Step 1: test direct tool responses first.
- Step 2: write strict validators.
- Step 3: build UI.

12. Bridge behavior warning
- Browser `runTool` responses are normalized and can differ from direct conversation tool-call shapes.

## Practical Consequence

This skill prioritizes reliability through strict response validation and user-visible error surfacing over permissive parsing.

