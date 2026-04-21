---
title: feat: Free logo sourcing and Composio-driven auth-card metadata
type: feat
status: active
date: 2026-04-21
origin: docs/product/ideations/2026-04-19-kiss-connection-management-requirements.md
---

# Free logo sourcing and Composio-driven auth-card metadata

## Overview

Upgrade two user-facing logo surfaces so they feel like a polished SaaS product without adding paid infrastructure:

1. CRM/search company avatars should use recognizable brand logos when we have a company domain.
2. Connection auth cards should render the provider's real branding and display metadata from Composio instead of hardcoded local icons and copy.

This plan carries forward the KISS connection-management principle that the connect card is the primary launch UX primitive and should feel intentional and productized, not generic or developer-facing (see origin: `docs/product/ideations/2026-04-19-kiss-connection-management-requirements.md`).

## Problem Statement

Today both surfaces are structurally correct but visually underpowered:

- Search rows rely on favicons or initials. That is acceptable as a fallback, but it does not deliver the fast-recognition brand feel seen in Attio-like CRM search.
- The connection auth card is more important and currently worse. It hardcodes Lucide icons plus local provider descriptions instead of using Composio's own toolkit metadata, so the card feels mocked rather than integrated.

## Proposed Solution

### Company/search logos

- Use Brandfetch Logo API as the primary free production source for company logos.
- Build direct hotlinked logo URLs from domain + public Brandfetch client ID.
- Keep a strict fallback chain:
  - Brandfetch logo
  - Google favicon
  - initials
- Reuse the existing `imageUrl` path in global search records so the list and preview automatically benefit from the richer source.

### Connection auth card metadata

- Extend our Composio catalog helper to return `logoUrl` in addition to `displayName` and `description`.
- Update `create_connection` and `reauthorize_connection` tool results to carry that logo metadata.
- Replace the hardcoded Lucide provider icon mapping in the auth card renderer with:
  - Composio logo image when available
  - existing provider icon fallback when not
- Keep the card copy and connection states aligned with the KISS connection-management approach from the origin document.

## Technical Considerations

- Brandfetch Logo API is free, hotlink-only, and requires a client ID in the image URL. We should treat the client ID as a public config value and keep image embedding browser-native.
- Brandfetch explicitly does not want programmatic logo replication or bulk caching on the free Logo API; this implementation should remain direct `img` embedding rather than server-side proxying.
- Composio's SDK/docs expose toolkit `logo` metadata. Our local helper currently discards that field, so the implementation change is primarily a data-plumbing fix, not a new integration.
- Fallback behavior matters more than perfect logo coverage. The UI must still degrade gracefully when no logo URL exists or an image fails.

## Acceptance Criteria

- [x] Global search rows show brand logos from a free production-safe source when a company domain is available.
- [x] Search still renders cleanly when the external logo is missing or fails to load.
- [x] Connection auth cards render provider logo, display name, and description from Composio metadata when available.
- [x] The auth card no longer depends on the hardcoded provider icon map as its primary visual.
- [x] No paid logo dependency is required for the shipped experience.
- [x] Targeted tests cover the new metadata and fallback behavior.
- [x] Browser verification confirms the updated search and connection card feel coherent in the live app.

## Outcome

- Search now uses a free logo chain of Brandfetch when configured, then Google favicon, then initials.
- Connection cards now prefer Composio-provided branding and degrade to local provider icons only when the logo is absent or fails to load.
- Validation passed in targeted tests and in the live signed-in app, with older historical connection cards correctly preserving fallback behavior because they were rendered from pre-logo payloads.

## Sources

- **Origin document:** [docs/product/ideations/2026-04-19-kiss-connection-management-requirements.md](/Users/sethlim/Documents/sunder-next-migration-20260225/docs/product/ideations/2026-04-19-kiss-connection-management-requirements.md)
- Brandfetch pricing: https://brandfetch.com/developers/pricing
- Brandfetch Logo API guidelines: https://docs.brandfetch.com/logo-api/guidelines
- Composio toolkit metadata docs: https://docs.composio.dev/docs/toolkits/fetching-tools-and-toolkits
- Composio auth UX docs: https://docs.composio.dev/docs/white-labeling-authentication
