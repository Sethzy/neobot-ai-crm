# Tasklet LinkedIn Automation - Detection Surfaces and Root Cause

This file documents why UI automation can still be detected even when using a real browser runtime.

## Detection Surfaces

1. Network Layer
- Signals: IP reputation, request burst timing, TLS/client patterns.
- Risk: cloud/VM-origin traffic can cluster into suspicious cohorts.

2. Browser Fingerprint Layer
- Signals: canvas/webgl behavior, navigator values, automation artifacts.
- Risk: runtime traits can deviate from typical consumer endpoints.

3. Interaction Layer
- Signals: click precision, movement smoothness, scroll cadence, dwell times.
- Risk: synthetic cursor/event paths are statistically distinct from human motor behavior.

4. Session Layer
- Signals: repeated action templates, velocity over time, repetitive route sequences.
- Risk: "human-like delay" does not remove long-horizon pattern consistency.

5. ML/Anomaly Layer
- Signals: aggregate sequence features across many sessions/accounts.
- Risk: even low-rate actions become classifiable with enough history.

## Root-Cause Statement

Primary vulnerability:
- deterministic perception-to-action policies + synthetic input injection produce detectable statistical signatures over time.

Secondary contributors:
- infrastructure-level clustering (shared VM/network characteristics)
- limited behavioral entropy despite random waits
- repeatable workflow templates (same screens, same action order)

## Practical Interpretation

Using a full browser and screenshots improves compatibility with UI changes vs scraping, but does not eliminate detection risk from behavioral and infrastructure telemetry.

