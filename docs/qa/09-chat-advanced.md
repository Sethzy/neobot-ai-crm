# QA Surface 9: Chat Advanced

> **PRs covered:** 22a (multimodal/images), 22b (tool output rendering + approval UI), 22 (compaction), 22c (block storage + context management), 22d (read_file image + negative lines), 22e (absolute agent paths)
> **Dogfoodable:** Yes
> **Time estimate:** 25-30 min manual

---

## Prerequisites

- Logged in with working chat
- A few test images (JPEG, PNG — varying sizes up to 5MB)
- A thread with 50+ messages OR willingness to generate one (for compaction testing)
- Supabase Storage dashboard open

---

## Dogfood Checklist (automated browser pass)

- [ ] Chat input has a paperclip/attachment button
- [ ] Tool calls render with expandable pills (not raw JSON)
- [ ] Expanded tool pills show formatted JSON (not JSON.stringify)
- [ ] Stop button appears during streaming
- [ ] No console errors during normal chat flow
- [ ] Image thumbnails render in message bubbles

---

## Manual QA Scenarios

### 9.1 Image upload via paperclip (PR 22a)

1. Click the paperclip/attachment button in chat input
2. Select a JPEG image
3. **Expected:** Preview thumbnail appears in the input area (before sending)
4. Type a message: "What's in this image?"
5. Send
6. **Expected:** Image appears in the user message bubble
7. **Expected:** Agent responds about the image content (model received the image)

**Notes / failures:**

---

### 9.2 Image paste from clipboard (PR 22a)

1. Copy an image to clipboard (screenshot or Cmd+C on an image)
2. Click in the chat input, paste (Cmd+V)
3. **Expected:** Preview thumbnail appears in input area
4. Send with a message
5. **Expected:** Image appears in message, agent can describe it

**Notes / failures:**

---

### 9.3 Remove attachment before sending (PR 22a)

1. Attach an image via paperclip
2. Preview thumbnail appears
3. Click the remove/X button on the preview
4. **Expected:** Attachment removed, input returns to text-only
5. Send a text-only message
6. **Expected:** No image in the sent message

**Notes / failures:**

---

### 9.4 Stop button (PR 22a)

1. Send a message that triggers a long response
2. While streaming, click the stop button
3. **Expected:** Response stops mid-stream
4. **Expected:** Partial response is preserved in the thread
5. Can send a new message after stopping
6. **Expected:** New message processed normally

**Notes / failures:**

---

### 9.5 Tool output rendering — JsonView (PR 22b)

1. Ask agent to create a contact (triggers tool call)
2. Click on the tool call pill to expand
3. **Expected:** Arguments section shows formatted, readable JSON tree (not raw JSON.stringify)
4. **Expected:** Result section shows formatted JSON tree
5. **Expected:** Nested objects are collapsible/expandable
6. **Expected:** Arrays render cleanly
7. **Expected:** Primitive values (strings, numbers, booleans) are distinguishable by color/style

**Notes / failures:**

---

### 9.6 Tool approval UI (PR 22b)

> Note: Full approval gate shipped in PRs 33-34. This surface tests the UI components from PR 22b. For end-to-end approval testing, see [Surface 12: Approvals](12-approvals.md).

1. If approval-gated tools exist: trigger one (e.g., a delete operation)
2. **Expected:** Tool call shows approve/deny buttons instead of auto-executing
3. Click "Approve"
4. **Expected:** Tool executes, result appears
5. Trigger another approval-gated tool
6. Click "Deny"
7. **Expected:** Tool shows denied state, agent acknowledges denial

**Notes / failures:**

---

### 9.7 Thread compaction (PR 22)

1. Create a thread with many messages (50+ messages, or trigger compaction threshold):
   - Send rapid messages about various topics
   - Or use a trigger thread that accumulates messages
2. Continue chatting past the context budget
3. **Expected:** Compaction fires — older messages summarized
4. **Expected:** Agent still remembers key facts from early in the conversation
5. Ask about something from the first few messages
6. **Expected:** Agent can reference it (from compaction summary, not raw messages)

**Notes / failures:**

---

### 9.8 Compaction summary format (PR 22c)

1. After compaction fires (from 9.7), check the compaction summary
2. **Expected:** Structured sections:
   - `## User Instructions`
   - `## Workflow`
   - `## Resources`
   - `## Current Focus`
3. **Expected:** NOT free-form narrative
4. **Expected:** Key entities (deal names, contacts, decisions) are preserved

**Notes / failures:**

---

### 9.9 Block storage (PR 22c)

1. Have a conversation with tool calls
2. **Verify in Supabase Storage:** `/{clientId}/toolcalls/{toolCallId}/` directories exist
3. Each should contain `args.json` and `result.json`
4. **Expected:** ALL tool calls stored, regardless of result size
5. In chat, if a tool result was truncated (> 5KB inline): ask agent to recover it
6. **Expected:** Agent uses `read_file('toolcalls/{id}/result.json')` to recover full data

**Notes / failures:**

---

### 9.10 Context management instructions (PR 22c)

1. In a long thread where compaction has occurred:
2. **Expected:** Agent sees `<context-management>` instructions
3. If agent encounters a `<context-removed>` marker, it should know to use `read_file` for recovery
4. Send: "Can you get the full details of that tool call from earlier?"
5. **Expected:** Agent reads from block storage

**Notes / failures:**

---

### 9.11 read_file image support (PR 22d)

1. Upload an image to storage (via chat or directly)
2. In chat: "Read the image at [path to uploaded image]"
3. **Expected:** Agent calls `read_file` on the image path
4. **Expected:** Agent receives image data and can describe the image
5. **Verify:** Response includes visual understanding (not just "I read a binary file")

**Notes / failures:**

---

### 9.12 Negative line indices (PR 22d)

1. Write a long file via agent: "Write a 50-line numbered list to test-lines.md"
2. "Read the last 10 lines of test-lines.md"
3. **Expected:** Agent uses `read_file` with negative line indices
4. **Expected:** Returns lines 41-50 (the last 10)

**Notes / failures:**

---

### 9.13 Absolute agent paths (PR 22e)

> Note: PR 22e has 3 tasks not yet done. Test only if implemented.

1. In chat: "Read my MEMORY.md"
2. **Expected:** Agent references path as `/agent/MEMORY.md` (absolute path)
3. "Write a note to /agent/notes/test.md"
4. **Expected:** Agent uses `/agent/` prefix in tool call
5. **Expected:** File stored internally at `notes/test.md` (prefix stripped)
6. **Verify:** All tool response paths use `/agent/` prefix consistently

**Notes / failures:**

---

## Edge Cases

- [ ] Upload image > 5MB — validation error, not crash
- [ ] Upload non-image file via image picker — rejected or handled
- [ ] PNG with transparency — renders correctly
- [ ] Multiple images in one message — all display
- [ ] Tool call with very large result (> 5KB) — truncated inline, full in block storage
- [ ] Compaction on thread with only 2 messages — doesn't trigger (below threshold)
- [ ] read_file on non-image binary file — graceful error (not image support, not crash)
- [ ] Negative line index on a 3-line file requesting last 10 — returns all 3 lines
- [ ] Stop button when no response is streaming — hidden or disabled

---

## Pass / Fail Criteria

- **Pass:** Images upload, paste, preview, and display correctly. Agent can see image content. Tool outputs render as formatted JSON trees. Compaction works on long threads with structured summaries. Block storage persists all tool calls. read_file handles images. Stop button works.
- **Fail:** Images don't display, tool output is raw JSON, compaction loses key context, block storage missing, image read_file returns binary garbage, stop button doesn't stop.
