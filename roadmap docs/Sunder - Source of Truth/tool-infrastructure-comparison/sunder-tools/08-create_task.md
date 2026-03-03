# 8. create_task

- Group: CRM Tools
- Category: Write (requires approval via system prompt)
- Source: `src/lib/runner/tools/crm/tasks.ts`
- Factory: `createTaskTools(supabase, clientId)`

## Verbatim Definition

```typescript
const create_task = tool({
  description:
    "Create a new CRM follow-up task.",
  inputSchema: z.object({
    title: z.string().min(1).describe("Task title."),
    description: z.string().optional().describe("Task description."),
    status: z.enum(crmTaskStatusValues).optional().describe("Task status."),
    due_date: taskTimestampSchema
      .optional()
      .describe("ISO-8601 due timestamp or YYYY-MM-DD date."),
    contact_id: z.string().uuid().optional().describe("Associated contact id."),
    deal_id: z.string().uuid().optional().describe("Associated deal id."),
  }),
  execute: async ({ title, description, status, due_date, contact_id, deal_id }) => {
    const normalizedDueDate = normalizeDueDate(due_date) ?? null;

    const { data, error } = await supabase
      .from("crm_tasks")
      .insert({
        client_id: clientId,
        title,
        description: description ?? null,
        status: status ?? "open",
        due_date: normalizedDueDate,
        contact_id: contact_id ?? null,
        deal_id: deal_id ?? null,
      })
      .select()
      .single();

    if (error) {
      return { success: false as const, error: error.message };
    }

    return {
      success: true as const,
      task: data,
    };
  },
});
```

## Timestamp Normalization

```typescript
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const taskTimestampSchema = z.union([
  z.string().datetime({ offset: true }),
  dateOnlySchema,
]);

function normalizeDueDate(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  return value.length === 10
    ? `${value}T00:00:00Z`
    : value;
}
```

## Input Schema

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | `string` | Yes | Task title |
| `description` | `string` | No | Task description |
| `status` | `enum` | No | open, completed. Defaults to "open" |
| `due_date` | `string` | No | ISO-8601 timestamp or YYYY-MM-DD date |
| `contact_id` | `string (uuid)` | No | Associated contact |
| `deal_id` | `string (uuid)` | No | Associated deal |

## Result Shape

```typescript
// Success
{ success: true, task: CrmTask }

// Error
{ success: false, error: string }
```

## Notes

- Accepts both `2026-03-15` and `2026-03-15T10:00:00+08:00` formats
- Date-only values normalized to midnight UTC (`T00:00:00Z`)
- Defaults status to "open"
