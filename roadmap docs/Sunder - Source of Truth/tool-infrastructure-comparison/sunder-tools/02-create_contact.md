# 2. create_contact

- Group: CRM Tools
- Category: Write (requires approval via system prompt)
- Source: `src/lib/runner/tools/crm/contacts.ts`
- Factory: `createContactTools(supabase, clientId)`

## Verbatim Definition

```typescript
const create_contact = tool({
  description:
    "Create a new contact. Use this when the user shares details about a new person.",
  inputSchema: z.object({
    first_name: z.string().min(1).describe("Contact first name."),
    last_name: z.string().min(1).describe("Contact last name."),
    email: z.string().email().optional().describe("Contact email address."),
    phone: z.string().min(1).optional().describe("Contact phone number."),
    type: z.enum(contactTypeValues).optional().describe("Contact classification."),
    notes: z.string().optional().describe("Free-form contact notes."),
  }),
  execute: async ({ first_name, last_name, email, phone, type, notes }) => {
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        client_id: clientId,
        first_name,
        last_name,
        type: type ?? "other",
        email: email ?? null,
        phone: phone ?? null,
        notes: notes ?? null,
      })
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
| `first_name` | `string` | Yes | Contact first name |
| `last_name` | `string` | Yes | Contact last name |
| `email` | `string (email)` | No | Contact email address |
| `phone` | `string` | No | Contact phone number |
| `type` | `enum` | No | buyer, seller, landlord, tenant, agent, other. Defaults to "other" |
| `notes` | `string` | No | Free-form contact notes |

## Result Shape

```typescript
// Success
{ success: true, contact: Contact }

// Error
{ success: false, error: string }
```

## Notes

- `client_id` injected from factory closure — never exposed to LLM
- Defaults `type` to "other" if omitted
- Returns full created row via `.select().single()`
- No duplicate detection — creates even if name/email exists
