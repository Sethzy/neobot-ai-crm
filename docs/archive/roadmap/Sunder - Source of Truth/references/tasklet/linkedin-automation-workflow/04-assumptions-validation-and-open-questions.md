# Tasklet LinkedIn Automation - Assumptions, Validation, Open Questions

This file separates observed behavior from inferred behavior.

## Confidence Tags

- High confidence:
  - Triggered run orchestration model.
  - Screenshot-driven UI interpretation loop.
  - Coordinate-based input injection model.
  - Multi-phase flow (trigger, provision, auth, loop, teardown).

- Medium confidence:
  - Exact runtime transport details (WebSocket or equivalent).
  - Persistence policy for browser sessions/connections.
  - Internal retry and fallback behavior for UI misalignment.

- Low confidence (needs direct trace evidence):
  - Exact anti-detection/randomization implementation details.
  - Concrete fingerprint hardening strategy (if any).
  - True action caps per campaign profile.

## Validation Checklist

1. Capture real run logs
- Trigger payload shape
- Tool calls in exact order
- Timing histogram of delays

2. Capture runtime metadata
- Browser build/channel
- Headless/headed mode
- Connection lifecycle behavior

3. Capture interaction traces
- Cursor path sampling
- Click offset distributions
- Scroll event distributions

4. Capture outcomes
- Success/failure per step
- Challenge/checkpoint rates
- Account-level warning or restriction events

## Open Questions

1. Is state persistence done at the VM level, browser profile level, or account-cookie level?
2. Does automation policy branch by account health score/history?
3. Are there explicit safety guardrails for platform policy violations?
4. Is there a circuit breaker when challenge frequency increases?

## Compliance Note

Automation against social platforms can violate platform terms and can lead to account restrictions or bans. Treat this architecture as reverse-engineering documentation, not as deployment guidance.

