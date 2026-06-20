# 4. search_deals

- Group: CRM Tools
- Category: Read
- Source: `src/lib/runner/tools/crm/deals.ts`
- Factory: `createDealTools(supabase, clientId)`

## Verbatim Definition

```typescript
const search_deals = tool({
  description:
    "Search deals by address or notes. Optionally filter by stage or contact id.",
  inputSchema: z.object({
    query: z.string().trim().min(1).optional().describe("Search term for address and notes."),
    stage: z.enum(dealStageValues).optional().describe("Optional deal stage filter."),
    contact_id: z.string().uuid().optional().describe("Optional contact id filter."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum results to return. Defaults to 20."),
  }),
  execute: async ({ query, stage, contact_id, limit }) => {
    const maxResults = limit ?? DEFAULT_RESULT_LIMIT;
    let queryBuilder = supabase.from("deals").select("*");

    if (query) {
      queryBuilder = queryBuilder.or(buildSearchExpression(query));
    }

    if (stage) {
      queryBuilder = queryBuilder.eq("stage", stage);
    }

    if (contact_id) {
      queryBuilder = queryBuilder.eq("contact_id", contact_id);
    }

    const { data, error } = await queryBuilder.limit(maxResults);

    if (error) {
      return { success: false as const, error: error.message };
    }

    const deals = data ?? [];

    return {
      success: true as const,
      deals,
      count: deals.length,
    };
  },
});
```

## Search Expression Builder

```typescript
function buildSearchExpression(query: string): string {
  const ilikeLiteral = buildContainsIlikeLiteral(query);

  return [
    `address.ilike.${ilikeLiteral}`,
    `notes.ilike.${ilikeLiteral}`,
  ].join(",");
}
```

## Input Schema

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | No | Search term for address and notes |
| `stage` | `enum` | No | leads, viewing, offer, negotiation, otp, completion, lost |
| `contact_id` | `string (uuid)` | No | Filter by associated contact |
| `limit` | `integer` | No | 1–50, defaults to 20 |

## Result Shape

```typescript
// Success
{ success: true, deals: Deal[], count: number }

// Error
{ success: false, error: string }
```

## Notes

- `query` is optional (unlike search_contacts) — allows listing all deals filtered by stage/contact
- Searches address and notes with OR ilike
- No ordering applied (relies on Supabase default)
