# 3. update_contact

- Group: CRM Tools
- Category: Write (requires approval via system prompt)
- Source: `src/lib/runner/tools/crm/contacts.ts`
- Factory: `createContactTools(supabase, clientId)`

## Verbatim Definition

```typescript
const update_contact = tool({
  description:
    "Update an existing contact by id. Use this after finding the contact via search_contacts.",
  inputSchema: z.object({
    contact_id: z.string().uuid().describe("UUID of the contact to update."),
    first_name: z.string().min(1).optional().describe("Updated first name."),
    last_name: z.string().min(1).optional().describe("Updated last name."),
    email: z.string().email().nullable().optional().describe("Updated email or null to clear."),
    phone: z.string().min(1).nullable().optional().describe("Updated phone or null to clear."),
    type: z.enum(contactTypeValues).optional().describe("Updated contact type."),
    notes: z.string().nullable().optional().describe("Updated notes or null to clear."),
  }),
  execute: async ({ contact_id, ...fields }) => {
    const updates = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(updates).length === 0) {
      return { success: false as const, error: "No fields to update" };
    }

    const { data, error } = await supabase
      .from("contacts")
      .update(updates)
      .eq("contact_id", contact_id)
      .eq("client_id", clientId)
      .select()
      .single();

    if (error) {
      return { success: false as const, error: error.message };
    }

    return {
      success: true as const,
      contact: data,
    };
  },
});
```

## Input Schema

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contact_id` | `string (uuid)` | Yes | UUID of the contact to update |
| `first_name` | `string` | No | Updated first name |
| `last_name` | `string` | No | Updated last name |
| `email` | `string (email) \| null` | No | Updated email or null to clear |
| `phone` | `string \| null` | No | Updated phone or null to clear |
| `type` | `enum` | No | Updated contact type |
| `notes` | `string \| null` | No | Updated notes or null to clear |

## Result Shape

```typescript
// Success
{ success: true, contact: Contact }

// Error
{ success: false, error: string }
```

## Notes

- Filters `undefined` values so only provided fields are patched
- Validates at least one field is present before querying
- Double-scoped: `.eq("contact_id", contact_id).eq("client_id", clientId)`
- Nullable fields accept `null` to explicitly clear the value
