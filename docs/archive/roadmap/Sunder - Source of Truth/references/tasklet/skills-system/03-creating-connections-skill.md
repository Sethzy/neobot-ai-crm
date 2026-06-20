# Creating Connections Skill

Source: `/agent/skills/system/creating-connections/SKILL.md`

## Intent

Defines preferred order and constraints for establishing new external-service connections.

## Connection Type Priority

1. `integrations`
- First choice when available.
- Use discovery and capability tools before creating.

2. `mcp`
- Custom MCP server connections when integration coverage is insufficient.

3. `direct_api`
- HTTP API connections requiring explicit endpoint/auth correctness.
- Requires reading `create-direct-api-connection.md` before use.

4. `computer_use`
- Remote browser/desktop runtime.
- Useful but slower/expensive; prefer when explicitly needed.

## Required Behaviors

- Verify capability match before creating connection.
- Avoid hallucinated endpoints/URLs.
- Offer alternative connection strategies when one path is unavailable.
- Avoid exhaustive service-list claims; frame capability as broad and extensible.

## Practical Consequence

This skill enforces a conservative "safest/highest-leverage first" connection strategy and discourages speculative setup.

