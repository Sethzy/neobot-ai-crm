# crm.cli vs Sunder — Comparative Analysis

> Date: 2026-04-07

## What crm.cli is

An open-source, headless CRM for solo/small teams, designed so AI agents can interact with CRM data via the filesystem rather than via APIs. Contacts, deals, and companies are JSON files. The CRM is SQLite-backed. On Linux it's a FUSE mount; on macOS it's a lightweight NFS server in Rust. There's an `llm.txt` at the mount root for agent schema discovery.

GitHub: https://github.com/dzhng/crm.cli

---

## Surface similarity vs actual product

At first glance: agent-operated CRM, similar adjacency to Sunder.

**Key difference**: crm.cli is a *local tool* — SQLite, personal machine, no cloud. Sunder is a *cloud agent harness* with per-client memory, channels (web, Telegram), and a safety/approval model. crm.cli is the storage layer for one practitioner. Sunder is the whole service — memory, context, runner, channels, approvals — for practitioners who don't know what a CRM file is.

They're not competing. crm.cli is nanoclaw/dench-claw territory (local-first agent tooling) vs Sunder's "vendor swap for a VA."

---

## What's worth borrowing

### 1. `llm.txt` — agent schema discovery at the entry point

**What they do**: Drop a `llm.txt` at the filesystem mount root. When an agent enters the directory, it reads the schema, conventions, and examples before doing anything. Zero onboarding friction.

**Sunder angle**: Sunder's 7-layer system prompt is the equivalent, but agents don't discover it — it's injected at run-time. The idea of *discoverable schema at the point of access* is worth thinking about for our tool definitions. Right now tools document themselves via parameter descriptions, but there's no top-level "here is how to think about all these tools" artifact that the model reads before deciding which tool to call. The system prompt does this but it's static. If we ever expose the CRM to an external model or a subagent with limited context, a `crm-schema.md` document in storage that the agent reads first would serve the same function as `llm.txt`.

**Verdict**: Interesting framing. Low priority — our current system prompt adequately primes the runner. Worth revisiting when we add subagents that need isolated CRM context.

---

### 2. Self-contained entity JSON — no join needed

**What they do**: Every entity file embeds linked records inline (deals inside a contact, recent activity inside a deal). Agents read one file and have everything. No join, no foreign-key resolution.

**Sunder angle**: Our CRM tools return flat records with IDs. When the agent wants deal + linked contact + recent activity, it needs 3 tool calls. This isn't a problem today — the runner calls tools iteratively — but it increases latency and token cost on multi-entity reads.

**What to borrow**: A "get_contact_bundle" or "get_deal_briefing" tool that returns one structured object with all linked entities embedded. Already done partially in the meeting summary prompt (pulling contact + deal context together) but not generalised.

**Verdict**: Concrete, worthwhile. Add a bundled-read tool to the CRM tool set when we see the agent making 3+ calls to assemble context for a single entity.

---

### 3. Pre-computed reports in storage

**What they do**: `reports/pipeline.json`, `reports/forecast.json`, etc. are pre-computed and available at a known path. Agents read a file instead of running a query.

**Sunder angle**: Every time the agent needs pipeline metrics, it calls `list_deals` and computes stage breakdown in context. This wastes tokens. Sunder already has a `crm_schema` tool for introspection — we could add a lightweight `get_crm_report` tool that materialises pipeline metrics server-side.

**Verdict**: Straightforward win. Already have the data (deals table + stage field). A `get_pipeline_report` tool returning counts/values by stage is a 1-hour build and eliminates a multi-step pattern that appears in almost every pipeline check run.

---

### 4. Phone normalisation to E.164

**What they do**: Accept any phone format, store E.164 (`+12125551234`), look up by any variant (last 7 digits, formatted). Data is clean regardless of source.

**Sunder angle**: We don't currently normalise phone numbers. The agent can write `(212) 555-1234` to a person record and later fail to match `+12125551234` from an incoming call or SMS. This will matter when we add telephony triggers.

**What to borrow**: Add E.164 normalisation on the `create_person`/`update_person` tool path. libphonenumber-js is the right library (Google-maintained, handles country codes). Default country from user profile.

**Verdict**: High value, especially before telephony. Add to `create_person`/`update_person` tool handlers.

---

### 5. Fuzzy dedup scoring on entity create

**What they do**: When creating a contact, compute similarity against all existing contacts (name Levenshtein + dice coefficient, shared email/phone/social). Score 0–1. Warn or block on high-confidence dupes.

**Sunder angle**: Nothing today. The agent can create duplicate people and companies freely. This causes CRM rot — two "Jane Doe" records, split deal history, broken memory. The agent may even create dupes across runs because it doesn't recognise an existing record.

**What to borrow**: A `find_similar_people` tool the runner can call before `create_person` to check for existing matches. Return a similarity score + reasons. Let the agent decide whether to merge, update the existing record, or proceed with creation. This is better than a hard block — the agent can reason about it.

**Verdict**: High value, clear bug pattern. Add `find_similar_people` as a pre-create check tool, and teach the runner to use it via system prompt guidance.

---

### 6. Immutable activity log (append-only)

**What they do**: Activities have no `updated_at`. Once written, they are read-only. To correct a mistake, you delete + recreate. This protects the audit trail.

**Sunder angle**: Our activities table has `updated_at` and the agent can overwrite activity notes. This is probably fine at this stage — the audit trail is less critical than getting the data right. But the principle of append-only for CRM history events is sound.

**Verdict**: File for later. When audit/compliance matters (e.g., financial advisors with regulatory requirements), make `create_activity` append-only and remove `update_activity`. Not worth the breaking change today.

---

### 7. Hooks system (pre/post mutation)

**What they do**: Config-driven shell hooks on mutations. `pre-contact-add` can reject the operation (non-zero exit). `post-deal-stage-change` fires notifications. Extensibility without code changes.

**Sunder angle**: Sunder has `agent_triggers` (cron, webhook, RSS) for event-driven runs, and the approval model for external-facing actions. But there's no hook equivalent for CRM mutations — when a deal moves stage, nothing fires automatically unless the agent explicitly triggers something.

**What to borrow**: A lightweight "CRM mutation → trigger" bridge. When `update_deal` changes `stage`, check for matching `agent_triggers` with type `crm_mutation` and fire them. This enables automations like "when a deal moves to Proposal, prepare the proposal briefing."

**Verdict**: Medium priority. Fits the existing trigger architecture cleanly. Worth prototyping as a trigger type after we stabilise the sandbox and meeting surface.

---

## What's not worth borrowing

| Pattern | Why |
|---|---|
| FUSE / NFS filesystem mount | Sunder's agent runs server-side in Vercel Functions. There's no local filesystem to mount. The CRM is Supabase (Postgres), not SQLite. |
| Single SQLite file | We're cloud-first. Supabase + RLS is the right choice at our scale and multi-tenant model. |
| CLI-first interface | Sunder's primary interface is web chat. A CLI wrapper would be useful for admin tasks but isn't a product primitive. |
| Spec-first 337 tests before implementation | Process choice — the principle (tests encode expected behaviour) is already our convention with Vitest. The specific "write 337 tests first" approach is overkill for our velocity. |
| Bun runtime | Next.js/Vercel dictates Node.js. Not applicable. |

---

## Summary

crm.cli confirms patterns we've suspected but not yet executed. The three highest-value borrows:

1. **`find_similar_people` pre-create dedup check** — prevents CRM rot, visible bug today
2. **E.164 phone normalisation** — small, high-value, prerequisite for telephony
3. **`get_pipeline_report` bundled CRM report tool** — reduces multi-step token waste on common pattern

Everything else is either already covered by our architecture or not applicable (local-first vs cloud).
