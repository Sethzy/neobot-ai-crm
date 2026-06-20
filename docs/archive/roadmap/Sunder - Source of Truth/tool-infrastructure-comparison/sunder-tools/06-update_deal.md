# 6. update_deal

- Group: CRM Tools
- Category: Write (requires approval via system prompt)
- Source: `src/lib/runner/tools/crm/deals.ts`
- Factory: `createDealTools(supabase, clientId)`

## Verbatim Definition

```typescript
const update_deal = tool({
  description:
    "Update an existing deal by id. Use this after finding the deal via search_deals.",
  inputSchema: z.object({
    deal_id: z.string().uuid().describe("UUID of the deal to update."),
    address: z.string().min(1).optional().describe("Updated address."),
    stage: z.enum(dealStageValues).optional().describe("Updated stage."),
    price: z.number().int().nonnegative().nullable().optional().describe("Updated price or null."),
    contact_id: z.string().uuid().nullable().optional().describe("Updated contact id or null."),
    notes: z.string().nullable().optional().describe("Updated notes or null."),
  }),
  execute: async ({ deal_id, ...fields }) => {
    const updates = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(updates).length === 0) {
      return { success: false as const, error: "No fields to update" };
    }

    const { data, error } = await supabase
      .from("deals")
      .update(updates)
      .eq("deal_id", deal_id)
      .eq("client_id", clientId)
      .select()
      .single();

    if (error) {
      return { success: false as const, error: error.message };
    }

    return {
      success: true as const,
      deal: data,
    };
  },
});
```

## Input Schema

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `deal_id` | `string (uuid)` | Yes | UUID of the deal to update |
| `address` | `string` | No | Updated address |
| `stage` | `enum` | No | Updated stage |
| `price` | `integer \| null` | No | Updated price or null to clear |
| `contact_id` | `string (uuid) \| null` | No | Updated contact or null to unlink |
| `notes` | `string \| null` | No | Updated notes or null to clear |

## Result Shape

```typescript
// Success
{ success: true, deal: Deal }

// Error
{ success: false, error: string }
```
