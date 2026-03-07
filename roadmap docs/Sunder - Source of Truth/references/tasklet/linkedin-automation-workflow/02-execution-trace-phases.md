# Tasklet LinkedIn Automation - Execution Trace (Phases)

This file converts the run into a deterministic phase model.

## Phase Model

1. Phase 1 - Trigger Ingestion
- Input: schedule event (`trigger_type`, `trigger_id`, `timestamp`, context payload).
- Output: active agent run with task intent loaded.

2. Phase 2 - Runtime Provisioning
- Input: requirement for browser control.
- Actions:
  - Reuse existing computer-use connection when possible.
  - Otherwise provision new `computer_use` connection/runtime.
- Output: active control toolset + browser runtime available.

3. Phase 3 - Auth State Resolution
- Input: navigation to LinkedIn entrypoint + screenshot capture.
- Decision branches:
  - Existing session detected -> proceed.
  - Login required -> user-assisted auth or credential path.
- Output: authenticated feed/session state.

4. Phase 4 - Action Loop
- Input: authenticated session + task policy (repost/connect/search constraints).
- Loop pattern:
  - Capture screen.
  - Infer targets/actions from visual state.
  - Execute input events.
  - Verify post-action state via screenshot.
  - Apply randomized wait windows and periodic longer breaks.
- Output: bounded number of completed actions and event log.

5. Phase 5 - Teardown
- Input: action cap reached, stop condition triggered, or policy guardrail hit.
- Actions:
  - Optional browser neutralization (`about:blank`) / close.
  - Connection persist-or-terminate decision.
- Output: run summary + termination status.

## Canonical Loop Pseudocode

```text
actionsTaken = 0
maxActions = 15

while actionsTaken < maxActions:
  stateImage = screenshot()
  actionPlan = analyze(stateImage)
  execute(actionPlan)
  verify(screenshot())

  actionsTaken += 1
  sleep(randomInterval())

  if actionsTaken % 5 == 0:
    sleep(randomLongBreak())
```

## Failure Modes To Track

- Runtime provision failure.
- Login wall or MFA interruption.
- UI drift (button moved/renamed) causing mis-clicks.
- Modal mismatch causing loop deadlock.
- Rate-limit/challenge checkpoint from LinkedIn.

