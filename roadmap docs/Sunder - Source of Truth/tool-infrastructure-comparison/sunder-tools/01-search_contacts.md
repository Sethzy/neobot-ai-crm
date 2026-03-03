# 1. search_contacts

- Group: CRM Tools
- Category: Read
- Source: `src/lib/runner/tools/crm/contacts.ts`
- Factory: `createContactTools(supabase, clientId)`

## Verbatim Definition

```typescript
const search_contacts = tool({
  description:
    "Search contacts by name, email, or phone. Optionally filter by contact type.",
  inputSchema: z.object({
    query: z.string().trim().min(1).describe("Search term for name, email, or phone."),
    type: z.enum(contactTypeValues).optional().describe("Optional contact type filter."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum results to return. Defaults to 20."),
  }),
  execute: async ({ query, type, limit }) => {
    const maxResults = limit ?? DEFAULT_RESULT_LIMIT;

    let queryBuilder = supabase
      .from("contacts")
      .select("*")
      .or(buildSearchExpression(query));

    if (type) {
      queryBuilder = queryBuilder.eq("type", type);
    }

    const { data, error } = await queryBuilder.limit(maxResults);

    if (error) {
      return { success: false as const, error: error.message };
    }

    const contacts = data ?? [];

    return {
      success: true as const,
      contacts,
      count: contacts.length,
    };
  },
});
```

## Search Expression Builder

```typescript
function buildSearchExpression(query: string): string {
  const ilikeLiteral = buildContainsIlikeLiteral(query);

  return [
    `first_name.ilike.${ilikeLiteral}`,
    `last_name.ilike.${ilikeLiteral}`,
    `email.ilike.${ilikeLiteral}`,
    `phone.ilike.${ilikeLiteral}`,
  ].join(",");
}
```

## Input Schema (Zod → JSON Schema)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | Yes | Search term for name, email, or phone |
| `type` | `enum` | No | One of: buyer, seller, landlord, tenant, agent, other |
| `limit` | `integer` | No | 1–50, defaults to 20 |

## Result Shape

```typescript
// Success
{ success: true, contacts: Contact[], count: number }

// Error
{ success: false, error: string }
```

## Notes

- Searches across 4 fields with OR: first_name, last_name, email, phone
- Uses case-insensitive `ilike` with escaped wildcards
- `clientId` not in schema — enforced by Supabase RLS
- No text search / ranking — simple contains match
