# How Tasklet Actually Executes: CSV Lead Cleaning Trace

> **Related trace:** `gmail-sandbox-execution-trace.md` — A more complex sandbox trace that chains a **connection tool** (Gmail API via OAuth) into sandbox execution, showing the full cross-environment data handoff. This trace covers pure sandbox; that one adds the external API layer.

## The Setup

User uploads a file and types into chat:

> "I have a CSV of 500 leads. Clean up the emails, remove duplicates, and give me the cleaned file."

The file lands at `/agent/uploads/leads.csv`.

That's the entire input. Everything below happens from this single sentence.

---

## THE CRITICAL DIFFERENCE FROM THE CALENDLY TRACE

The Calendly briefing workflow used **zero sandboxes**. Every tool was an HTTP call — web search, web scrape, Slack post. The LLM thought, called tools, got results. No operating system involved.

This workflow is different. The LLM cannot clean a CSV by thinking about it. It cannot regex 500 rows in its head. It needs to run actual code. Which means:

- A **sandbox** (Alpine Linux) must spin up
- The **FUSE mount** must connect so the sandbox can see `/agent/uploads/leads.csv`
- A real **Python process** must execute inside the sandbox
- Results must be written back through **FUSE** to durable cloud storage

This is the 5% case. The case where the sandbox earns its keep.

---

## PHASE 1: THE LLM DECIDES WHAT TO DO

### Step 1: I read the input and assess the task

I'm an LLM. I see the user's message and the uploaded file path. I think:

- I need to look at this CSV first to understand its structure
- Then I need to write a Python script to clean it
- Then I need to run that script
- Then I need to give the user the result

This is all happening in the LLM's reasoning. No tools called yet. No sandbox. Just the model planning.

### Step 2: I peek at the file to understand its structure

I call:

```
read_file(path: "/agent/uploads/leads.csv", start_line: 1, end_line: 20)
```

**What happens under the hood:**

```
LLM generates tool call
    ↓
Platform intercepts the tool call
    ↓
Platform's read_file implementation talks DIRECTLY to cloud storage
    (this is a platform tool — it does NOT go through the sandbox)
    (no sandbox exists yet — none has been spun up)
    ↓
Cloud storage returns the first lines of the file
    ↓
Platform feeds the result back to the LLM
```

**No sandbox involved.** `read_file` is a platform tool. It goes straight to the storage backend via API. The LLM sees something like:

```
name,email,company,phone,source
John Smith,JOHN.SMITH@ACME.COM,Acme Corp,+1-555-0101,LinkedIn
jane doe,jane.doe@techstart.io,TechStart,,Website
John Smith,john.smith@acme.com,Acme Corp,+1-555-0101,LinkedIn
Bob Wilson,bob@INVALID,Wilson LLC,+1-555-0103,Referral
Alice Chen,alice.chen@bigco.com,BigCo Inc,+1-555-0104,LinkedIn
,,,,
Mike Brown,mike.brown@startup.co,StartupCo,+1-555-0105,Website
jane doe,JANE.DOE@techstart.io,TechStart,,Website
...
```

Now I can see the problems:
- Mixed case emails (JOHN.SMITH@ACME.COM vs john.smith@acme.com)
- Duplicate rows (John Smith appears twice, same person different case)
- Invalid email (bob@INVALID — no TLD)
- Empty rows (the row with just commas)
- Duplicate Jane Doe (different email casing)

### Step 3: I decide to write a Python script

I could try to do this with a single `run_command` with an inline script, but for 500 rows with multiple cleaning rules, a proper script is better. I write it to my persistent storage:

```
write_file(
  path: "/agent/home/scripts/clean_leads.py",
  content: <the script below>
)
```

**What happens under the hood:**

```
LLM generates tool call
    ↓
Platform intercepts the tool call
    ↓
Platform's write_file implementation talks DIRECTLY to cloud storage
    (still a platform tool — still no sandbox)
    ↓
Cloud storage saves the file at /agent/home/scripts/clean_leads.py
    ↓
Platform returns success to the LLM
```

**Still no sandbox.** I've read a file and written a file, both through platform tools that talk directly to cloud storage. The script content is something like:

```python
import pandas as pd
import re
import sys

# Read the CSV
df = pd.read_csv('/agent/uploads/leads.csv')
original_count = len(df)
print(f"Original rows: {original_count}")

# Step 1: Drop completely empty rows
df = df.dropna(how='all')
empty_dropped = original_count - len(df)
print(f"Empty rows dropped: {empty_dropped}")

# Step 2: Normalize emails to lowercase and strip whitespace
df['email'] = df['email'].astype(str).str.strip().str.lower()

# Step 3: Validate email format (basic regex)
email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
invalid_mask = ~df['email'].apply(lambda x: bool(re.match(email_pattern, x)))
invalid_count = invalid_mask.sum()
invalid_emails = df[invalid_mask][['name', 'email']].to_string()
print(f"Invalid emails found: {invalid_count}")
if invalid_count > 0:
    print(f"Invalid entries:\n{invalid_emails}")

# Remove rows with invalid emails
df = df[~invalid_mask]

# Step 4: Normalize name fields (title case, strip whitespace)
df['name'] = df['name'].astype(str).str.strip().str.title()
df['company'] = df['company'].astype(str).str.strip().str.title()

# Step 5: Remove duplicates based on normalized email
before_dedup = len(df)
df = df.drop_duplicates(subset='email', keep='first')
dupes_removed = before_dedup - len(df)
print(f"Duplicates removed: {dupes_removed}")

# Step 6: Sort by company then name
df = df.sort_values(['company', 'name'])

# Step 7: Write cleaned file
output_path = '/agent/home/outputs/leads-cleaned.csv'
df.to_csv(output_path, index=False)
final_count = len(df)
print(f"Final clean rows: {final_count}")
print(f"Saved to: {output_path}")

# Summary
print(f"\n--- SUMMARY ---")
print(f"Original:        {original_count}")
print(f"Empty dropped:   {empty_dropped}")
print(f"Invalid emails:  {invalid_count}")
print(f"Duplicates:      {dupes_removed}")
print(f"Final count:     {final_count}")
```

---

## PHASE 2: THE SANDBOX SPINS UP

### Step 4: I run the script

Now — and ONLY now — do I need the sandbox. I call:

```
run_command(command: "uv run --with pandas python3 /agent/home/scripts/clean_leads.py")
```

**This is the moment everything changes.** Here's what happens under the hood, step by step:

```
LLM generates the run_command tool call
    ↓
Platform intercepts it (just like any other tool call)
    ↓
Platform says: "This is run_command. I need a sandbox."
    ↓
┌─────────────────────────────────────────────────────┐
│  SANDBOX PROVISIONING (happens in ~1-3 seconds)     │
│                                                     │
│  1. Platform spins up a fresh Alpine Linux 3.23     │
│     container. Clean slate. Nothing installed        │
│     except the preinstalled tools (Python 3.12,     │
│     bash, ffmpeg, pandoc, imagemagick, jq, etc.)    │
│                                                     │
│  2. Platform mounts /agent/ via FUSE                │
│     This connects the container's filesystem to     │
│     cloud storage. Now:                             │
│     - /agent/uploads/leads.csv    → readable        │
│     - /agent/home/scripts/clean_leads.py → readable │
│     - /agent/home/outputs/        → writable        │
│                                                     │
│  The sandbox is ready.                              │
└─────────────────────────────────────────────────────┘
    ↓
Platform executes the command inside the sandbox:
    uv run --with pandas python3 /agent/home/scripts/clean_leads.py
```

### Step 5: The command executes — here's exactly what happens inside the sandbox

```
┌─────────────────────────────────────────────────────────────┐
│  INSIDE THE SANDBOX                                         │
│                                                             │
│  $ uv run --with pandas python3 /agent/home/scripts/clean_leads.py
│                                                             │
│  Step 5a: uv resolves and installs pandas                   │
│  ─────────────────────────────────────────                   │
│                                                             │
│  Step 5b: Python starts and hits the first line:            │
│  ─────────────────────────────────────────────               │
│  df = pd.read_csv('/agent/uploads/leads.csv')               │
│                                                             │
│  Python calls open('/agent/uploads/leads.csv')              │
│  Linux kernel sees /agent/ is a FUSE mount                  │
│  FUSE driver intercepts the open() call                     │
│  FUSE driver makes an HTTP request to cloud storage         │
│  Cloud storage returns the file bytes                       │
│  FUSE driver passes bytes back to Python                    │
│  Python/pandas parses the CSV into a DataFrame              │
│                                                             │
│  *** THIS IS WHERE FUSE EARNS ITS KEEP ***                  │
│  Python and pandas have NO IDEA they read from the cloud.   │
│  They just did open() on a "file" and got bytes.            │
│  The FUSE mount made cloud storage look like a disk.        │
│                                                             │
│  Step 5c: The script processes the data                     │
│  ──────────────────────────────────────                      │
│  All the cleaning happens in memory (RAM):                  │
│  - dropna() — pandas operation, pure memory                 │
│  - str.lower() — pandas operation, pure memory              │
│  - regex matching — Python operation, pure memory           │
│  - drop_duplicates() — pandas operation, pure memory        │
│  - sort_values() — pandas operation, pure memory            │
│                                                             │
│  No FUSE involvement here. The data is already loaded       │
│  into pandas. All processing is pure CPU + RAM.             │
│                                                             │
│  Step 5d: The script writes the output                      │
│  ─────────────────────────────────────                       │
│  df.to_csv('/agent/home/outputs/leads-cleaned.csv')         │
│                                                             │
│  Python calls open('/agent/home/outputs/leads-cleaned.csv') │
│  Linux kernel sees /agent/ is a FUSE mount                  │
│  FUSE driver intercepts the write                           │
│  Python writes CSV bytes                                    │
│  FUSE driver uploads those bytes to cloud storage           │
│  Cloud storage saves the file                               │
│  FUSE driver confirms success to Python                     │
│                                                             │
│  *** THE FILE NOW EXISTS IN CLOUD STORAGE ***               │
│  Even when this sandbox is destroyed, the file persists.    │
│                                                             │
│  Step 5e: Python produces stdout                            │
│  ─────────────────────────────────────────────               │
│  Original rows: 500                                         │
│  Empty rows dropped: 12                                     │
│  Invalid emails found: 8                                    │
│  Duplicates removed: 34                                     │
│  Final clean rows: 446                                      │
│  Saved to: /agent/home/outputs/leads-cleaned.csv            │
│                                                             │
│  --- SUMMARY ---                                            │
│  Original:        500                                       │
│  Empty dropped:   12                                        │
│  Invalid emails:  8                                         │
│  Duplicates:      34                                        │
│  Final count:     446                                       │
│                                                             │
│  Step 5f: Done                                              │
│  ──────────────────────────────────────                      │
│  The process is done. The command completed successfully.    │
└─────────────────────────────────────────────────────────────┘
```

### Step 6: The sandbox returns the result

```
Sandbox captures stdout + stderr + exit code
    ↓
Platform receives the result
    ↓
Platform feeds it back to the LLM as the run_command tool result:
{
  "exitCode": 0,
  "stdout": "Original rows: 500\nEmpty rows dropped: 12\n...",
  "stderr": ""
}
    ↓
┌─────────────────────────────────────────────────────┐
│  SANDBOX TEARDOWN                                   │
│                                                     │
│  What survives:                                     │
│  - /agent/home/outputs/leads-cleaned.csv            │
│    (in cloud storage, written through FUSE)         │
│  - /agent/home/scripts/clean_leads.py               │
│    (in cloud storage, written by write_file tool)   │
│  - /agent/uploads/leads.csv                         │
│    (in cloud storage, original upload)              │
└─────────────────────────────────────────────────────┘
```

---

## PHASE 3: BACK TO PURE LLM (No Sandbox)

### Step 7: I read the results and respond to the user

I'm back to being just an LLM reading tool results. The sandbox is gone. I see the stdout output showing 446 clean rows out of 500 original.

I might want to verify the output. I call:

```
read_file(path: "/agent/home/outputs/leads-cleaned.csv", start_line: 1, end_line: 10)
```

**This does NOT spin up a new sandbox.** `read_file` is a platform tool. It reads directly from cloud storage.

I see the first 10 rows of the cleaned CSV. Everything looks good. Names are title case. Emails are lowercase. No duplicates in sight.

### Step 8: I respond to the user

I produce a text response:

> "Done! Cleaned your leads file:
>
> - **500** original rows
> - **12** empty rows removed
> - **8** invalid emails removed (e.g., bob@INVALID)
> - **34** duplicates removed (matched on normalized email)
> - **446** clean leads remaining
>
> Here's the file: [leads-cleaned.csv](avfs:///agent/home/outputs/leads-cleaned.csv)"

The user clicks the link and downloads the file. Done.

---

## THE FULL TIMELINE WITH SANDBOX BOUNDARIES

```
TIME    WHAT HAPPENS                          SANDBOX?   FUSE?
─────   ────────────────────────────────────  ─────────  ─────
0.0s    User sends message                    No         No
0.1s    LLM starts thinking                   No         No
0.3s    LLM calls read_file (peek at CSV)     No         No
        Platform reads from cloud storage     No         No
0.5s    LLM receives CSV preview              No         No
0.8s    LLM calls write_file (save script)    No         No
        Platform writes to cloud storage      No         No
1.0s    LLM calls run_command                 No         No
        ─── SANDBOX BOUNDARY ───────────────
1.0s    Platform provisions Alpine container  STARTING   No
1.5s    Platform mounts FUSE                  YES        MOUNTING
2.0s    Sandbox ready                         YES        YES
2.5s    uv installs pandas                    YES        No (uses network, not FUSE)
4.0s    Python reads CSV via FUSE             YES        YES ← read
4.1s    Python processes data in memory       YES        No (pure RAM)
4.2s    Python writes cleaned CSV via FUSE    YES        YES ← write
4.3s    Python prints summary to stdout       YES        No
4.3s    Python exits                          YES        YES
        ─── SANDBOX BOUNDARY ───────────────
4.5s    Platform receives stdout result       No         No
4.7s    LLM calls read_file (verify output)   No         No
        Platform reads from cloud storage     No         No
5.0s    LLM produces final response           No         No
5.5s    User sees the result                  No         No
```

Total sandbox alive time: ~3.3 seconds out of a ~5.5 second interaction.

FUSE was actively used for exactly TWO operations:
1. Python reading the input CSV (~100ms network call disguised as file read)
2. Python writing the output CSV (~100ms network call disguised as file write)

Everything else was either platform tools talking directly to cloud storage, or in-memory processing inside the sandbox.

---

## CONTRAST WITH THE CALENDLY TRACE

| Aspect | Calendly briefing | CSV cleaning |
|---|---|---|
| Sandbox spun up? | No — never | Yes — for the Python script |
| FUSE mount used? | No — never | Yes — to read input CSV and write output |
| Platform tools used? | Yes — web search, web scrape, Slack post | Yes — read_file, write_file |
| `run_command` called? | No | Yes — once |
| Why? | All work was HTTP API calls that platform tools handle | Data processing requires real code execution |
| Subagent used? | Yes — to isolate research context | No — the work is straightforward, no context bloat risk |

---

## WHAT THIS MEANS FOR YOUR (SUNDER) ARCHITECTURE

For this exact workflow, here's what Sunder would do differently:

### Instead of FUSE

```
TASKLET:
  Python does open('/agent/uploads/leads.csv')
  FUSE intercepts → fetches from cloud storage → returns bytes
  Python doesn't know it's reading from the cloud

SUNDER:
  Runner downloads file from Supabase Storage to sandbox local disk
  Python does open('/tmp/leads.csv')
  Normal local file read — fast, no FUSE
  Python doesn't know it came from Supabase
```

The result is identical. The file gets into Python either way. Sunder's approach has an extra download step upfront but then all file reads are pure local disk speed. Tasklet's approach skips the download but every file read goes through the network via FUSE.

For a single CSV file, the difference is negligible. For a script that reads the same file 100 times in a loop (unlikely but possible), Sunder's local-copy approach would be faster because there's no network round-trip per read.

### Instead of writing through FUSE

```
TASKLET:
  Python does df.to_csv('/agent/home/outputs/leads-cleaned.csv')
  FUSE intercepts → uploads to cloud storage
  File is now durable

SUNDER:
  Python does df.to_csv('/tmp/leads-cleaned.csv')
  Writes to local disk (fast)
  Runner then uploads /tmp/leads-cleaned.csv to Supabase Storage
  File is now durable
```

Again, identical outcome. Sunder has an extra upload step after the script finishes. Tasklet does it transparently during the script. Both end up with the file in cloud storage.

### The real trade-off

| | Tasklet (FUSE) | Sunder (download/upload) |
|---|---|---|
| Code simplicity | Script just uses file paths — no awareness of cloud | Runner must wrap script in download-before/upload-after logic |
| Performance | Every file I/O is a network call (hidden by FUSE) | File I/O is local disk speed; network only at start/end |
| Debugging | If FUSE fails, the script gets a mysterious disk error | If download fails, you get a clear "download failed" error before the script even starts |
| Infrastructure | Need FUSE driver in every sandbox | No FUSE. Just HTTP calls to Supabase Storage API |

For your 5% sandbox usage, the download/upload approach is the right call. You avoid an entire infrastructure component (FUSE driver) for a feature you rarely use. The extra download/upload wrapper is a few lines of code in your runner.

---

## STATE DIAGRAM FOR THIS EXECUTION

```
BEFORE EXECUTION:
├── Cloud storage
│   └── /agent/uploads/leads.csv              ← user uploaded this
├── SQL database                               ← empty (not used in this workflow)
└── No sandbox exists

DURING EXECUTION (sandbox alive):
├── Cloud storage
│   ├── /agent/uploads/leads.csv              ← untouched
│   └── /agent/home/scripts/clean_leads.py    ← written by write_file tool
├── Sandbox (Alpine Linux)
│   ├── FUSE mount at /agent/ → cloud storage
│   ├── /tmp/ → local ephemeral disk
│   ├── Python process running
│   ├── pandas loaded in RAM
│   └── DataFrame being processed in RAM
└── SQL database                               ← still not used

AFTER EXECUTION (sandbox destroyed):
├── Cloud storage
│   ├── /agent/uploads/leads.csv              ← untouched
│   ├── /agent/home/scripts/clean_leads.py    ← persists (reusable)
│   └── /agent/home/outputs/leads-cleaned.csv ← THE OUTPUT (written through FUSE)
├── No sandbox                                 ← destroyed
└── SQL database                               ← still not used
```

Three files in cloud storage. Zero sandboxes. Zero running processes. The agent is "asleep" until the next message arrives.
