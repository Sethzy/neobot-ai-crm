# Task List System

Tasklet's task list is not a queue. It's a note-to-future-self system for amnesiac LLM workers.

## Files

- `00-task-list-live-trace.md` — Live API trace of full CRUD lifecycle, architecture diagram, trigger+task combo pattern, "not a queue" analysis, Sunder implementation mapping

## Key Findings

1. **Binary state:** Tasks exist (open) or are deleted (done). No in-progress, blocked, etc.
2. **Zero execution semantics:** No worker picks up tasks. LLM reads them and decides.
3. **System-reminder shows count only:** `Open tasks: 3` — no titles, no IDs.
4. **Trigger + task = resumable work:** Tasks are how an amnesiac worker remembers unfinished business across trigger runs.
5. **Implementation is ~20 lines:** One DB table, three tool handlers, one count query in system-reminder.
6. **Sunder extends this:** Our V1 adds status lifecycle, approval flags, and dual CRM/Agent task model on top of the same core mechanic.
