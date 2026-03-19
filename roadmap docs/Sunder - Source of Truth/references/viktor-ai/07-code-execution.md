# Viktor Code Execution

Source: Direct Q&A with Viktor instance (2026-03-16)

## Timeouts

| Scope | Limit |
|---|---|
| Single bash command | 600,000ms (10 minutes) |
| `wait_for_paths` (child threads) | 60 minutes |
| Overall thread | No hard limit observed (15+ minute tasks succeed) |

## Network Access

**Full outbound.** No firewall restrictions detected.
- Can hit any public API
- Can download files
- Can clone git repos
- Confirmed: `curl https://httpbin.org/get` returns 200

## File Output → Slack Pipeline

```
Viktor writes file to disk (e.g., /work/output/report.pdf)
    ↓
coworker_upload_to_slack(file_path) → returns permalink
    ↓
Viktor embeds permalink in Slack message
```

Upload goes through the **tool gateway** (not direct S3). From user's perspective: Viktor writes a file, uploads it, sends a link. One step.

## Error Handling & Retry

- No hard retry limit — retries are part of the **agentic loop**
- Viktor sees error in stdout/stderr → reasons about it → fixes code → reruns
- Typical: **2-5 iterations** on tricky code
- If truly stuck: tells the user rather than looping forever
- Each iteration costs credits → motivation to get it right early

## Comparison to Sunder

Sunder has **no code execution** today. All agent work happens through structured tool calls (CRM operations, file I/O, messaging). This is a fundamentally different model:

| | Viktor | Sunder |
|---|---|---|
| Primary primitive | Write code → run it → iterate | Call structured tools |
| Error handling | See error → fix code → rerun | Tool returns `{ success: false, error }` → agent adjusts |
| Flexibility | Can do anything Python can do | Limited to pre-built tool capabilities |
| Reliability | Varies (code may fail, needs iteration) | High (tools are deterministic) |
| Cost per task | Higher (multiple LLM turns for iteration) | Lower (fewer turns needed) |
| Security surface | Large (arbitrary code execution) | Small (constrained tool inputs) |
