# 5. create_deal

- Group: CRM Tools
- Category: Write (requires approval via system prompt)
- Source: `src/lib/runner/tools/crm/deals.ts`
- Factory: `createDealTools(supabase, clientId)`

## Verbatim Definition

```typescript
const create_deal = tool({
  description:
    "Create a new deal. Use this for new listings or opportunities.",
  inputSchema: z.object({
    address: z.string().min(1).describe("Property address."),
    stage: z.enum(dealStageValues).optional().describe("Deal stage."),
    price: z.number().int().nonnegative().optional().describe("Deal price in whole units."),
    contact_id: z.string().uuid().optional().describe("Associated contact id."),
    notes: z.string().optional().describe("Deal notes."),
  }),
  execute: async ({ address, stage, price, contact_id, notes }) => {
    const { data, error } = await supabase
      .from("deals")
      .insert({
        client_id: clientId,
        address,
        stage,
        price,
        contact_id,
        notes: notes ?? null,
      })
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
| `address` | `string` | Yes | Property address |
| `stage` | `enum` | No | leads, viewing, offer, negotiation, otp, completion, lost |
| `price` | `integer` | No | Deal price in whole units (non-negative) |
| `contact_id` | `string (uuid)` | No | Associated contact |
| `notes` | `string` | No | Deal notes |

## Result Shape

```typescript
// Success
{ success: true, deal: Deal }

// Error
{ success: false, error: string }
```

## Notes

- `stage` defaults to DB default if omitted (likely "leads")
- `price` is integer — no decimal currency support in v1
- `contact_id` is optional — deals can exist without a linked contact
