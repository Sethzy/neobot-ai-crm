# 10. create_interaction

- Group: CRM Tools
- Category: Write (requires approval via system prompt)
- Source: `src/lib/runner/tools/crm/interactions.ts`
- Factory: `createInteractionTools(supabase, clientId)`

## Verbatim Definition

```typescript
const create_interaction = tool({
  description:
    "Record a CRM interaction such as a call, meeting, email, message, viewing, or note.",
  inputSchema: z.object({
    contact_id: z.string().uuid().describe("Contact id linked to the interaction."),
    deal_id: z.string().uuid().optional().describe("Optional deal id linked to the interaction."),
    type: z.enum(interactionTypeValues).describe("Interaction type."),
    summary: z.string().optional().describe("Interaction summary."),
    occurred_at: interactionTimestampSchema
      .optional()
      .describe("ISO-8601 timestamp or YYYY-MM-DD date when the interaction occurred."),
  }),
  execute: async ({ contact_id, deal_id, type, summary, occurred_at }) => {
    const normalizedOccurredAt = normalizeOccurredAt(occurred_at);

    const { data, error } = await supabase
      .from("interactions")
      .insert({
        client_id: clientId,
        contact_id,
        deal_id,
        type,
        summary: summary ?? null,
        occurred_at: normalizedOccurredAt ?? new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return { success: false as const, error: error.message };
    }

    return {
      success: true as const,
      interaction: data,
    };
  },
});
```

## Timestamp Normalization

```typescript
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const interactionTimestampSchema = z.union([
  z.string().datetime({ offset: true }),
  dateOnlySchema,
]);

function normalizeOccurredAt(occurredAt: string | undefined): string | undefined {
  if (!occurredAt) {
    return undefined;
  }
  return occurredAt.length === 10
    ? `${occurredAt}T00:00:00Z`
    : occurredAt;
}
```

## Input Schema

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contact_id` | `string (uuid)` | Yes | Contact linked to the interaction |
| `deal_id` | `string (uuid)` | No | Optional deal linked to the interaction |
| `type` | `enum` | Yes | call, meeting, email, message, viewing, note |
| `summary` | `string` | No | Interaction summary |
| `occurred_at` | `string` | No | ISO-8601 timestamp or YYYY-MM-DD. Defaults to now |

## Result Shape

```typescript
// Success
{ success: true, interaction: Interaction }

// Error
{ success: false, error: string }
```

## Notes

- Append-only in v1 — no update or delete exposed
- `occurred_at` defaults to current timestamp if omitted
- `contact_id` is required — interactions must be linked to a contact
- `deal_id` is optional — not all interactions relate to a deal
