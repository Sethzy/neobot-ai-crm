# 9. update_task

- Group: CRM Tools
- Category: Write (requires approval via system prompt)
- Source: `src/lib/runner/tools/crm/tasks.ts`
- Factory: `createTaskTools(supabase, clientId)`

## Verbatim Definition

```typescript
const update_task = tool({
  description:
    "Update an existing CRM task by id.",
  inputSchema: z.object({
    task_id: z.string().uuid().describe("UUID of the task to update."),
    title: z.string().min(1).optional().describe("Updated task title."),
    description: z.string().nullable().optional().describe("Updated task description or null."),
    status: z.enum(crmTaskStatusValues).optional().describe("Updated task status."),
    due_date: taskTimestampSchema
      .nullable()
      .optional()
      .describe("Updated due timestamp/date or null."),
    contact_id: z.string().uuid().nullable().optional().describe("Updated contact id or null."),
    deal_id: z.string().uuid().nullable().optional().describe("Updated deal id or null."),
  }),
  execute: async ({ task_id, ...fields }) => {
    const updates = Object.fromEntries(
      Object.entries({
        ...fields,
        due_date: normalizeDueDate(fields.due_date),
      }).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(updates).length === 0) {
      return { success: false as const, error: "No fields to update" };
    }

    const { data, error } = await supabase
      .from("crm_tasks")
      .update(updates)
      .eq("task_id", task_id)
      .eq("client_id", clientId)
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

## Input Schema

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | `string (uuid)` | Yes | UUID of the task to update |
| `title` | `string` | No | Updated title |
| `description` | `string \| null` | No | Updated description or null to clear |
| `status` | `enum` | No | open, completed |
| `due_date` | `string \| null` | No | Updated due date or null to clear |
| `contact_id` | `string (uuid) \| null` | No | Updated contact or null to unlink |
| `deal_id` | `string (uuid) \| null` | No | Updated deal or null to unlink |

## Result Shape

```typescript
// Success
{ success: true, task: CrmTask }

// Error
{ success: false, error: string }
```
