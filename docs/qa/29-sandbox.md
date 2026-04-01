# QA Surface 29: Sandbox (Code Execution)

> **PRs covered:** 52 (analyze_spreadsheet — Sprites + Excel, superseded), 53 (publish_artifact — showcase pages, superseded), 52a (sandbox workflow skills — outer + inner, superseded), 54a (async execution — webhook + cron delivery, superseded), 55 (general escape hatch — execute_in_sandbox, per-client Sprites, superseded), 59 (Vercel Sandbox + bash-tool migration — active), 63 (unified agent filesystem), 64 (sandbox workspace preload), 65 (Composio file bridge)
> **Dogfoodable:** Partial (requires SANDBOX_GOLDEN_SNAPSHOT_ID env var + live Vercel Sandbox snapshot)
> **Time estimate:** 30-40 min manual
> **v2 tools:** `bash`, representative Composio file tools such as `GOOGLEDRIVE_FIND_FILE`, `GOOGLEDRIVE_DOWNLOAD_FILE`, `GOOGLEDRIVE_UPLOAD_FILE`

> **Note:** PRs 52–55 were Sprites/Fly.io-based (per-client persistent VMs, async execution, `execute_in_sandbox` tool). PR 59 replaced all of that with ephemeral Vercel Sandbox + `bash-tool`. Scenarios 29.1–29.14 below are **superseded** and no longer valid. Active QA coverage starts at 29.15.

---

## Prerequisites

- `SANDBOX_GOLDEN_SNAPSHOT_ID` set (golden snapshot ID from Vercel Sandbox dashboard)
- `VERCEL_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID` set for local dev (OIDC auto-configures on Vercel deployment)
- At least one skill in `skills/` for the test client (to verify skill preloading)
- Optional: xlsx or CSV file for file attachment tests
- Optional but recommended: a connected Google Drive account with file find/download/upload tools activated

---

## Dogfood Checklist (automated browser pass)

- [ ] Chat composer accepts .xlsx and .csv file uploads
- [ ] Sending a data analysis request triggers bash tool call (visible in tool call trace)
- [ ] Output files appear in chat as download links after bash execution
- [ ] Download links are clickable and download valid files
- [ ] SANDBOX_GOLDEN_SNAPSHOT_ID missing → agent returns graceful error, not an exception
- [ ] Second bash call in same run reuses existing sandbox (no double create)
- [ ] Uploaded files render after reload via `storagePath`-backed download resolution
- [ ] Files under `/agent/uploads/` are visible to bash in `/workspace/agent/uploads/` but remain read-only to agent file tools
- [ ] Files under `/agent/home/` persist across later bash runs without re-uploading
- [ ] Google Drive download/upload flows bridge through `/agent/home/` instead of dumping file bytes into chat

---

## Manual QA Scenarios

> Scenarios 29.1–29.14 (Sprites/Fly.io era) are superseded by PR 59. See archived section below.

### PR 59: Vercel Sandbox + bash-tool (active)

### 29.15 Lazy bash tool — first invocation creates sandbox

1. In Langfuse, find a run that called `bash`
2. Check the timing: sandbox creation should happen on the first `bash` call, not at run start
3. **Expected:** System prompt includes `<sandbox>` section only when `SANDBOX_GOLDEN_SNAPSHOT_ID` is set
4. **Verify:** No sandbox is created for runs that don't call `bash`

**Notes / failures:**

---

### 29.16 Data analysis with uploaded file

1. Upload a CSV or xlsx file (any tabular data)
2. Say: "Analyze this file and tell me the totals by category"
3. **Expected:** Agent gathers context, calls `bash` with a Python/pandas command
4. **Expected:** Result appears in chat with the analysis
5. **Verify:** Any output files (charts, processed xlsx) appear as download links

**Notes / failures:**

---

### 29.17 Artifact sync — output files returned as downloads

1. Say: "Write me a Python script to generate a sample property comparison report as CSV, then run it"
2. **Expected:** Agent calls `bash` to write + run the script
3. **Expected:** The generated CSV appears in chat as a download link
4. **Verify:** Download link works and file contains expected content
5. **Verify in Langfuse:** `artifacts` field on bash result has at least one entry with `downloadUrl`

**Notes / failures:**

---

### 29.18 Skill files preloaded into sandbox

1. Ensure client has at least one skill (e.g. `re-analyst`) in Supabase Storage under `skills/`
2. Say: "Run Python to list all files in /vercel/sandbox/workspace/skills/"
3. **Expected:** Agent calls `bash`, lists directory shows skill files (e.g. `skills/re-analyst/SKILL.md`)
4. **Verify:** Skill reference files (if any) also appear under `skills/re-analyst/references/`

**Notes / failures:**

---

### 29.19 context.json preloaded with prior tool results

1. Start a conversation: search CRM for a contact, then ask for a Python analysis
2. **Expected:** Agent calls search_crm first, then calls `bash`
3. **Verify:** Agent in bash call can reference the CRM result (it was written to `input/context.json`)
4. Optional: ask agent to "print the contents of input/context.json" to verify structure

**Notes / failures:**

---

### 29.20 Missing snapshot ID → graceful error

1. Temporarily unset `SANDBOX_GOLDEN_SNAPSHOT_ID` in local dev
2. Send any request that would trigger bash tool use
3. **Expected:** Bash tool returns error message mentioning `SANDBOX_GOLDEN_SNAPSHOT_ID`
4. **Expected:** No unhandled exception, run completes gracefully

**Notes / failures:**

---

### 29.21 Attachment filename sanitization

1. Upload a file with spaces and special characters (e.g. "my deals (2024).xlsx")
2. Ask agent to analyze it
3. **Expected:** Agent can reference the file; bash shows it at `input/my_deals__2024_.xlsx`
4. **Verify:** No filename collision or permission error in bash

**Notes / failures:**

---

### 29.22 Sandbox cleanup on run completion

1. Trigger a run that calls bash
2. After run completes, verify no lingering sandbox resources
3. **Verify in Vercel Dashboard:** Sandbox shows as stopped/destroyed after run ends
4. **Verify in Langfuse:** `onFinish` callback executed (no orphan sandbox log lines after run end)

**Notes / failures:**

---

### PR 63: Unified agent filesystem

### 29.23 Uploaded files resolve through `storagePath` and stay read-only

1. Upload a file in chat, then refresh the thread or reopen it from the sidebar
2. Click the rendered attachment or download link from the older message
3. **Expected:** The file still opens/downloads successfully even if the original signed URL has expired
4. **Verify in network tools:** The request goes through `/api/files/download` before redirecting to a fresh signed URL
5. In chat, ask the agent to overwrite that same path under `/agent/uploads/`
6. **Expected:** The agent gets a read-only error for `/agent/uploads/` and does not modify the uploaded file

**Notes / failures:**

---

### PR 64: Sandbox workspace preload

### 29.24 `/agent/home/` persists across later bash runs

1. In chat, ask the agent to create a file in `/agent/home/` using bash, such as `python3 - <<'PY'` writing `agent/home/qa-home-check.txt`
2. After that run finishes, send a second message asking the agent to read `/workspace/agent/home/qa-home-check.txt` in a new bash command
3. **Expected:** The second bash run finds the file immediately from preload; the agent does not need to recreate it
4. **Verify:** The file path is under `/workspace/agent/home/`, not `output/` or `input/`

**Notes / failures:**

---

### 29.25 `/agent/uploads/` is preloaded into bash workspace

1. Upload a file in chat before any bash call
2. Ask the agent to run `find /workspace/agent/uploads -maxdepth 2 -type f | sort`
3. **Expected:** Bash lists the uploaded file under `/workspace/agent/uploads/`
4. **Expected:** The file is available without the old per-message `input/` attachment preload loop

**Notes / failures:**

---

### 29.26 Empty `/agent/home/` still exists on first sandbox boot

1. Use a client/thread with no files stored under `home/`
2. Trigger the first `bash` call with: "Run `ls -la /workspace/agent/home` and tell me what you see"
3. **Expected:** The directory exists even when empty
4. **Expected:** Bash does not fail with "No such file or directory"

**Notes / failures:**

---

### PR 65: Composio file bridge

### 29.27 Google Drive download bridges into `/agent/home/`

1. Ensure Google Drive is connected and `GOOGLEDRIVE_FIND_FILE` plus `GOOGLEDRIVE_DOWNLOAD_FILE` are active
2. In chat, ask the agent to find a known Drive file and download it so it can analyze it later
3. **Expected:** The agent uses Google Drive connection tools rather than asking for a manual upload
4. **Expected:** The resulting file is saved under `/agent/home/…`, not pasted into the chat as a raw binary/text blob
5. If a sandbox is already active, ask the agent to list `/workspace/agent/home/`
6. **Expected:** The downloaded Drive file is already present in the live sandbox workspace

**Notes / failures:**

---

### 29.28 Google Drive upload resolves `/agent/` paths back to local temp files

1. Ensure there is a file in `/agent/home/` from either a prior bash run or scenario 29.27
2. In chat, ask the agent to upload that file to Google Drive
3. **Expected:** The agent passes the `/agent/home/...` path to the connection tool and the upload succeeds
4. **Expected:** The tool does not fail because of a missing local file path inside Composio
5. **Verify in Google Drive:** A new file appears with the expected content

**Notes / failures:**

---

## Edge Cases

- [ ] `SANDBOX_GOLDEN_SNAPSHOT_ID` not set → bash tool returns error, runner does not crash
- [ ] Two bash calls in same run → same sandbox reused (no double create, initPromise race guard)
- [ ] Transient Vercel Sandbox creation error on first call → next bash call retries and succeeds
- [ ] File attachment named `context.json` → renamed to `context_2.json` (does not overwrite generated context)
- [ ] Two attachments with same filename → deduplicated with counter suffix (`report.xlsx`, `report_2.xlsx`)
- [ ] Very large xlsx upload (>5MB) → preloads without timeout
- [ ] Skill directory has nested subdirs (e.g. `references/`) → all files walk-recursed and preloaded
- [ ] Run ends with error → `onError` callback stops sandbox (no orphan Vercel Sandbox instance)
- [ ] Output file written but unchanged on second bash call → artifact sync skips re-upload (SHA-256 match)
- [ ] No bash calls in a run → no sandbox created, no cost incurred
- [ ] Old chat messages missing `storagePath` still fall back to the stored URL and remain downloadable
- [ ] `/agent/uploads/` paths reject write/edit/delete attempts while still listing correctly in `read_file`
- [ ] Drive download occurs before first bash call → file lands in storage and appears once sandbox boots later
- [ ] Drive download occurs after bash is already active → file is pushed into the live sandbox without waiting for a reboot
- [ ] Drive upload from `/agent/home/...` cleans up temp files and does not leak raw local temp paths into agent-visible output

---

## Superseded Scenarios (PRs 52–55, Sprites/Fly.io era)

> The following scenarios were written for the Sprites-based sandbox (PRs 52–55). They reference `execute_in_sandbox`, `SPRITES_TOKEN`, per-client Sprites, async webhook delivery, and cron fallback — none of which exist in the current implementation. **Do not run these.**

<details>
<summary>29.1–29.14 (superseded)</summary>

### 29.1 PDF report generation (SUPERSEDED)
- Was: `execute_in_sandbox` with `skills: ["pdf_creation"]`, async delivery, here.now URL
- Now: Use `bash` tool with Python/LibreOffice directly

### 29.2 Excel spreadsheet analysis (SUPERSEDED)
- Was: `execute_in_sandbox` with `skills: ["excel_editing", "re-analyst"]`
- Now: Upload xlsx, ask agent to analyze → `bash` with pandas

### 29.3–29.8 (SUPERSEDED) — per-client Sprite reuse, auto-queue, async execution, webhook/cron delivery
- These were all features of the Sprites architecture and are no longer applicable

### 29.9–29.11 (SUPERSEDED) — async non-blocking return, webhook delivery, cron fallback
- Vercel Sandbox + bash-tool is synchronous within the streamText loop

### 29.12–29.14 (SUPERSEDED) — workflow skill orchestration (deal-comparison, companion skills, QUESTION: prefix)
- Skill preloading still works (skills/ in workspace), but the tool call flow is via `bash`, not `execute_in_sandbox`

</details>

---

## Pass / Fail Criteria

- **Pass:** Bash tool lazily creates Vercel Sandbox on first call; uploads and home files preload into `/workspace/agent/`; `/agent/uploads/` remains read-only while attachment links keep resolving through `storagePath`; output files return as downloads; context.json contains prior tool results; Google Drive download/upload flows bridge cleanly through `/agent/home/`; graceful error when `SANDBOX_GOLDEN_SNAPSHOT_ID` is missing; no double sandbox creation on concurrent calls; sandbox stops after run
- **Fail:** Sandbox creates at run start; sandbox is not stopped after run; bash crashes the runner; uploads/home are missing from the workspace; older attachment links break after reload; `/agent/uploads/` is writable; Drive file download/upload bypasses `/agent/home/` or leaks raw temp paths/bytes; or missing snapshot configuration causes an unhandled exception
