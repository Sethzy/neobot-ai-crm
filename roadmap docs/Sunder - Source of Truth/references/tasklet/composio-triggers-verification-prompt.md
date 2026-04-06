# Composio Triggers — Verification Prompt

**Context:** We're planning to use Composio's trigger system for external event-driven triggers in Sunder (Gmail, Calendar, Drive, etc.). We've done initial research but need a second pair of eyes to confirm against official docs and the actual SDK.

**Reference:** Full research + implementation plan is in `trigger-system-internals.md` (same folder).

---

## What to verify

### 1. Polling interval floor

We believe:
- Composio-managed OAuth → **15 min minimum** polling interval
- Own OAuth app → **1 min minimum** polling interval
- Source: Composio changelog 2026-03-13

**Check:** Confirm this is still current. Look for any updates since March 2026. Is there a way to go below 1 min with custom auth?

### 2. Webhook delivery

We believe:
- Configure a project-level webhook URL in Composio dashboard or via API (`POST /org/project/webhook/update`)
- Composio POSTs trigger events to that URL with HMAC signature (`webhook-signature: v1,<base64>`)
- Webhook secret is in Project Settings

**Check:** Confirm the exact header format, HMAC algorithm, and verification process. Is there a per-trigger webhook URL override (like Pipedream has), or only project-level?

### 3. Gmail trigger payload

We got this from `triggersTypes.retrieve('GMAIL_NEW_GMAIL_MESSAGE')`:
```
message_id, thread_id, sender, to, subject, message_text, 
message_timestamp, attachment_list, payload (raw Gmail object)
```

**Check:** Does the actual fired event match this schema? Is `message_text` the full body or a snippet? Does `attachment_list` include content or just metadata?

### 4. SDK API surface

We're using `@composio/client` (already in node_modules). Confirmed these endpoints:
- `triggerInstances.upsert(slug, { connected_account_id, trigger_config })` — create
- `triggerInstances.listActive({ user_ids, connected_account_ids })` — list
- `triggerInstances.manage.update(id, { status: 'enable' | 'disable' })` — toggle
- `triggerInstances.manage.delete(id)` — delete
- `triggersTypes.list({ toolkit_slugs })` — browse catalog
- `triggersTypes.retrieve(slug)` — get config/payload schema

**Check:** Is `@composio/client` the right package for this, or should we use `@composio/core` (which is what our `src/lib/composio/client.ts` currently initializes)? Do we need a separate API key or client initialization for triggers vs tools?

### 5. Own OAuth app setup

We believe:
- Register GCP project + OAuth consent screen
- Get Google verification for sensitive/restricted Gmail scopes (1-4 weeks)
- Plug client ID/secret into Composio's "custom auth" config
- This unlocks 1 min polling + "Sunder" branding on consent screen

**Check:** What's the exact Composio configuration path for custom OAuth? Is it per-toolkit (Gmail, Calendar separately) or one OAuth app covers all Google services? Any gotchas?

---

## Where to look

- Composio docs: https://docs.composio.dev/docs/triggers
- Composio changelog: https://docs.composio.dev/docs/changelog
- Composio SDK source: `node_modules/@composio/client/src/resources/trigger-instances/`
- Composio triggers types: `node_modules/@composio/client/src/resources/triggers-types.ts`
- Our Composio client: `src/lib/composio/client.ts`
- Pipedream repo (for comparison): `github.com/PipedreamHQ/pipedream/tree/master/components/gmail/sources`
