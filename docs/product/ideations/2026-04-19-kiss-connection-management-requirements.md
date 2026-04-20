---
date: 2026-04-19
topic: kiss-connection-management
---

# KISS Connection Management for Launch

## Problem Frame

Sunder's current connection model asks the agent to reason about too much lifecycle machinery: integration discovery, capability inspection, connection creation, tool activation, reauthorization, and generic tool execution wrappers. That is defensible as a long-term control plane, but it is the wrong default for launch.

For launch, the primary user need is simpler: connect a small set of high-value apps quickly, then use them immediately. A user who says "connect Notion" or "connect Gmail" should see one inline auth card, complete OAuth, and move on. They should not need a second permissions workflow just to make the connection usable.

The launch goal is a Goose-like product workflow:

- connect an app
- authorize it
- use it on the next message

This reduces agent confusion, reduces tool surface area, improves mobile/chat UX, and avoids shipping connection complexity that users do not need to understand.

## Core Model

```text
User: "connect Notion"
  -> agent calls connect_service("notion")
  -> chat shows inline auth card
  -> user completes OAuth
  -> thread shows lightweight connected event
  -> Notion tools are available on the next message
  -> user asks for a Notion task and the agent uses the connection
```

The key product rule is: successful connection setup makes the service usable without a second activation step.

## Requirements

- R1. Sunder supports a curated launch set of connection providers. The initial connection UX is optimized for known, high-value apps rather than generic catalog discovery.
- R2. When the user asks to connect a supported provider, the agent can initiate that connection directly without first calling discovery or capability-inspection tools.
- R3. Connection initiation renders an inline auth card in chat. The card includes the provider name, a short explanation of what the connection enables, and a clear primary action to authorize the connection.
- R4. The auth card supports simple status states: ready to connect, connecting, connected, failed, and needs reauthorization.
- R5. After OAuth succeeds, the thread shows a lightweight success event confirming that the provider was connected.
- R6. A successfully connected provider becomes usable on the next message or next run. v1 does not require tools to appear mid-run after OAuth completion.
- R7. Connection management for v1 is reduced to four user-meaningful actions: list current connections, connect a provider, reauthorize a provider, and disconnect a provider.
- R8. Reauthorization is treated as part of the same simple lifecycle as connection setup. If credentials are expired or invalid, the user sees a reconnect flow rather than a separate permission-management workflow.
- R9. Once a provider is connected, the user does not need a second "activate tools" or "grant tool permissions" step before the agent can use that provider.
- R10. Approval remains required for truly external or destructive actions where appropriate, but approval is attached to those actions themselves, not to connection activation.
- R11. v1 supports at most one active connection per provider per user. Same-provider multi-account routing is out of scope.
- R12. The user can inspect a simple connected-services list that shows which providers are connected and which need reauthorization. This list does not need deep capability or per-tool metadata.
- R13. If the user asks to connect an unsupported provider, the assistant should respond clearly that the provider is not yet supported rather than entering a broad integration-discovery workflow.
- R14. The launch UX must preserve the mental model that the product is doing work, not asking the user to manage infrastructure. Connection management should feel like a lightweight setup action, not a separate operating mode.

## Success Criteria

- A user can connect a supported provider such as Notion or Gmail through one short in-chat flow with an inline auth card.
- After successful OAuth, the user can ask for work involving that provider on the next message without any tool-activation ceremony.
- The standard connection path does not require discovery, capability inspection, or activation tools.
- The user can understand connection state at a glance: connected, needs reauth, or disconnected.
- The launch flow feels materially simpler than the current connection lifecycle and does not require the user to learn integration-management concepts.

## Scope Boundaries

- No per-tool activation or post-OAuth "grant permissions to the agent" flow for connection setup.
- No same-run tool injection after OAuth completion.
- No same-provider multi-account support in v1.
- No generic integration catalog discovery or capability-inspection flow in the primary launch UX.
- No connection-scoped skill files or per-turn connection-context injection for ordinary connection use.
- No admin/governance console for fine-grained connection policy management.
- No requirement that launch wait for a full native MCP migration. The launch behavior matters more than the backend implementation path.

## Key Decisions

- **Product workflow over LLM workflow:** Connection management should feel like a product affordance, not an agent planning problem.
- **Inline auth card is the core UX primitive:** The auth card is the launch surface for connecting providers in chat.
- **Next-message availability over same-run availability:** Tools become available after the connection succeeds, on the next message or fresh run. This avoids mid-run injection complexity and reduces runner coupling.
- **No separate activation layer in v1:** OAuth completion is sufficient to make a connection usable.
- **Curated providers over long-tail discovery:** Launch should optimize for the most important providers, not the entire integration catalog.
- **One connection per provider in v1:** This keeps the mental model and data model simple for launch.
- **Approval attaches to real side effects, not connection readiness:** Sending email or deleting external content may still require approval. Connecting a provider does not.
- **This supersedes the approval-heavy connection activation direction for launch:** The richer activation model may still matter later for governance or multi-account control, but it is intentionally not the launch path.

## Dependencies / Assumptions

- The existing connection backend can be simplified to support the four-action lifecycle without exposing the full previous management surface to the agent.
- A curated provider set is sufficient for launch demand.
- OAuth callbacks can return enough metadata to show a user-meaningful connected state.
- Existing approval mechanisms for external-facing actions can remain independent from connection setup.

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] Should the same auth card component be reused in both chat and settings, or is chat the only required launch surface?
- [Affects R5][Technical] What exact thread event copy should be standardized for successful connection, failed connection, and reauthorization?
- [Affects R7][Technical] How should the current connection-management tools be collapsed into the four-action model without breaking older thread behavior?
- [Affects R11][Technical] What is the exact product behavior if a user tries to reconnect a provider that is already connected under a different account?
- [Affects R1][Product] Which providers are explicitly in the curated launch set, and which are deferred?

## Next Steps

-> `/plan` for structured implementation planning
