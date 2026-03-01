# V1 Markov Chain State Graph Review

**Source spec:** `../product-dev/01-V1 App Spec (Primary Baseline).md`  
**Review date:** February 23, 2026  
**Goal:** Build a full Markov-style state graph from the v1 spec and surface flaws.

## Status Update (February 23, 2026)

This review is still useful as the baseline analysis, but part of the spec has now been patched.

Resolved in `../product-dev/01-V1 App Spec (Primary Baseline).md`:

1. **Issue #1 (approval ordering contradiction)** is now fixed with an explicit approval-before-side-effects flow in Request Lifecycle plus a dedicated approval pause contract and canonical run-status contract.
2. **Issue #2 (pause deadlock risk)** is fixed via explicit `waiting_user_input` checkpoint + lock release + resume behavior.
3. **Issue #6 (same vs new conversation ambiguity)** is now fixed with explicit `chat_identity_key` + lane-based thread model and concrete `new_thread_requested` transition rules.

Remaining flaws in this document should be read as historical findings unless separately marked resolved in a later update.

## Modeling Rules

1. This is an event-labeled Markov graph (next state depends on current state + event).
2. The spec does not define transition probabilities, so this graph is unweighted.
3. "Full" means all explicit state machines named in the source spec: runner, queueing, onboarding, connection lifecycle, guided interview, approvals, tasks, goals, memory, replay/reconnect, and compaction.

## Full State Graph (Mermaid)

```mermaid
flowchart TD
  %% ---------------- Runner + Queue ----------------
  subgraph R[Runner + Per-Thread Queue]
    R0[Thread Idle]
    R1[Inbound Event Received]
    R2[Resolve thread_key/thread_id]
    R3[Try Per-Thread Lock]
    R4[Queued (same thread already active)]
    R5[Load Context]
    R6[Load Setup/Customization Skill Path]
    R7[Model Invocation]
    R8[Tool Calls Needed]
    R9[Tool Execution]
    R10[Needs User Clarification]
    R11[Awaiting High-Risk Approval]
    R12[Final Synthesis]
    R13[Stream Response]
    R14[Persist Run + Thread Metadata]
    R15[Run Completed]
    R16[Run Partial Terminal]
    R17[Run Failed Retryable]
    R18[Run Failed Terminal]
    R19[Dequeue Next Same-Thread Message]

    R0 --> R1 --> R2 --> R3
    R3 -->|lock busy| R4
    R3 -->|lock acquired| R5
    R4 -->|active run completes| R19 --> R5
    R5 -->|onboarding/setup/customization request| R6 --> R7
    R5 -->|normal request| R7
    R7 -->|final answer| R13
    R7 -->|tool calls| R8 --> R9 --> R12
    R9 -->|needs user decision| R10 -->|user answer| R9
    R9 -->|high-risk action gate| R11 -->|approved| R9
    R11 -->|rejected| R16
    R9 -->|transient tool error| R17 -->|retry success| R9
    R17 -->|retry exhausted| R18
    R12 --> R13 --> R14 --> R15
    R15 -->|same-thread queue non-empty| R19
    R15 -->|queue empty| R0
  end

  %% ---------------- Connection lifecycle ----------------
  subgraph C[Connection Lifecycle]
    C0[External Capability Needed]
    C1[List Existing Connections]
    C2[Existing Connection Compatible]
    C3[Verify Exact Tool Names/Capability]
    C4[Activate Minimum Required Tools]
    C5[Approval Needed for Activation]
    C6[Create New Connection Required]
    C7[Choose integrations]
    C8[Choose mcp]
    C9[Choose direct_api]
    C10[Managed Allowlist Check]
    C11[Connect -> Provider Sign-in -> Consent]
    C12[Connection Ready]
    C13[Resume Blocked Step]
    C14[Auth Failure Detected]
    C15[Reauthorize Prompted]
    C16[Retry Blocked Step]
    C17[Connection Denied/Unavailable]
    C18[Connection Failed Terminal]

    C0 --> C1
    C1 -->|compatible exists| C2 --> C3 --> C4 --> C5
    C5 -->|approved| C12 --> C13
    C5 -->|rejected| C17

    C1 -->|none compatible| C6
    C6 --> C7
    C6 --> C8
    C6 --> C9
    C8 --> C10
    C9 --> C10
    C7 --> C11
    C10 -->|allowlisted| C11
    C10 -->|not allowlisted| C17
    C11 --> C12 --> C13

    C12 -->|later auth failure| C14 --> C15 --> C16 --> C13
    C16 -->|retry fails| C18
  end

  %% ---------------- Onboarding/setup ----------------
  subgraph O[Onboarding / Setup]
    O0[Setup Not Started]
    O1[Detect Missing Prerequisites]
    O2[Auto-complete Repairable Steps]
    O3[Await User-Required Action]
    O4[Resume from Last Completed Step]
    O5[Verification Run]
    O6[Verification Passed]
    O7[Verification Failed]
    O8[First Useful Output Delivered]
    O9[Setup Complete]

    O0 --> O1 --> O2
    O2 -->|needs user auth/choice| O3 -->|user completes action| O4 --> O2
    O2 -->|all steps complete| O5
    O5 --> O6 --> O8 --> O9
    O5 --> O7 -->|retry path| O2
  end

  %% ---------------- Guided interview + mid-run clarification ----------------
  subgraph I[Guided Interview / AskUserQuestion]
    I0[Interview Start]
    I1[Ask Next Missing Question]
    I2[Await User Answer]
    I3[Generate Plain-Language Preview]
    I4[Await Action: Save Draft/Test Once/Activate]
    I5[Save Draft]
    I6[Test Once]
    I7[Activate Workflow]
    I8[Mid-Run Pause for Clarification]
    I9[Resume Same Run Step]

    I0 --> I1 --> I2 --> I1
    I1 -->|no missing questions| I3 --> I4
    I4 --> I5
    I4 --> I6
    I4 --> I7
    I8 --> I2
    I2 -->|clarification answer| I9
  end

  %% ---------------- Approval gate ----------------
  subgraph A[Approval Gate]
    A0[No Approval Required]
    A1[Approval Requested]
    A2[Approval Granted]
    A3[Approval Rejected]

    A0 --> A2
    A1 --> A2
    A1 --> A3
  end

  %% ---------------- Task models ----------------
  subgraph T[Tasks + Goals]
    T0[AgentTask planning]
    T1[AgentTask planned]
    T2[AgentTask in_progress]
    T3[AgentTask blocked]
    T4[AgentTask done]
    T5[AgentTask cancelled]
    T6[AgentTask needs_approval flag]

    T7[CRM Task open]
    T8[CRM Task removed]

    T9[Goal active]
    T10[Goal paused]
    T11[Goal done]

    T0 --> T1 --> T2 --> T4
    T2 --> T3 --> T2
    T2 --> T5
    T1 --> T6 --> T2

    T7 --> T8

    T9 --> T10
    T10 --> T9
    T9 --> T11
  end

  %% ---------------- Memory ----------------
  subgraph M[Shared Memory]
    M0[Load Shared Memory Before Thread History]
    M1[Memory Change Proposed]
    M2[Await Explicit User Approval]
    M3[Memory Versioned Write]
    M4[Memory Update Rejected]

    M0 --> M1 --> M2
    M2 -->|approved| M3
    M2 -->|rejected| M4
  end

  %% ---------------- Replay/Reconnect + compaction ----------------
  subgraph S[Replay/Reconnect + Compaction]
    S0[Live Stream]
    S1[Disconnect]
    S2[Reconnect]
    S3[Replay from Cursor]
    S4[Deduplicate by Sequence ID]
    S5[Resume Live Stream]

    S6[Within Context Budget]
    S7[Over Context Budget]
    S8[Compaction Summary Built]
    S9[Prompt Assembly: memory -> summary -> recent turns]

    S0 --> S1 --> S2 --> S3 --> S4 --> S5 --> S0
    S6 --> S9
    S7 --> S8 --> S9
  end

  %% ---------------- Cross-subgraph links ----------------
  R8 --> C0
  C13 --> R9
  R6 --> O0
  O9 --> R7
  R10 --> I8
  I9 --> R9
  R11 --> A1
  A2 --> R9
  A3 --> R16
  R5 --> M0
  R13 --> S0
  R5 --> S6
  R5 --> S7
```

## Flaws Found From The Graph

### Critical

1. **Approval ordering contradiction**  
   In `Request Lifecycle`, approval gating appears *after* final response streaming/persistence (steps 13-15), but in core architecture and scheduler diagram approval is in-path before result execution. This creates conflicting transitions for high-risk actions.

2. **Potential same-thread deadlock on pause/approval**  
   Spec requires one active run per thread + queueing. If a run is paused waiting for user clarification/approval and lock is not released, user reply can stay queued behind the paused run forever.

3. **Task state model and board model do not align**  
   Agent Task states are `planning/planned/in_progress/blocked/done/cancelled`, while board columns are `Planned/In Progress/Review/Done` with blocked as badge. `review` is not in Agent Task states, and `planning/cancelled` have no explicit board mapping.

### High

4. **No explicit terminal path when connection choice is impossible**  
   If no existing connection works and managed allowlist blocks all possible `mcp/direct_api` options (or integrations lack coverage), state transitions to user-visible recovery are not fully defined.

5. **Reauthorization loop has no hard retry bounds**  
   "Reauthorize and retry from blocked step" is defined, but no max attempts or terminal fail condition is specified at policy level.

6. **Thread identity contract lacks concrete fork transition**  
   Contract says reopened conversations must reuse thread unless user explicitly starts a new conversation, but the explicit transition for "new conversation requested" is undefined against `thread_key = channel + chat_type + chat_id`.

### Medium

7. **`partial` terminal state is referenced but not fully normalized in status contracts**  
   Tasklet alignment requires `partial` as valid terminal state, but canonical run-status enum and UI handling path are not explicitly locked in this spec.

8. **CRM binary state vs unified board semantics are underspecified**  
   CRM tasks are open/removed only, but unified board expects four columns + badges. Mapping behavior for CRM tasks in board views is not fully specified.

9. **Replay cursor ownership is split ambiguously**  
   UI is defined as cursor owner, but lifecycle persistence also stores "latest replay sequence cursor" in run metadata. Source-of-truth precedence is not explicitly defined.

## Recommended Spec Fixes (Minimal)

1. Add a canonical **run-state enum** and transition table in `Request Lifecycle`:  
   `queued -> running -> waiting_user_input -> waiting_approval -> running -> completed | partial | failed`.
2. Define lock behavior explicitly: paused runs must release the lock and register a resumable checkpoint keyed to thread.
3. Add explicit board mapping table for all Agent Task states and CRM states.
4. Add `connection_unavailable` and `authorization_exhausted` terminal states with user-visible remediation text.
5. Add retry limits + cooldown policy for reauthorization.
6. Add explicit `new_thread_requested` transition and server behavior for generating a new `thread_id` under same channel identity.
