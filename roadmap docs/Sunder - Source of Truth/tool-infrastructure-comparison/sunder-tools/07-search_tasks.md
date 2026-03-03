# 7. search_tasks

- Group: CRM Tools
- Category: Read
- Source: `src/lib/runner/tools/crm/tasks.ts`
- Factory: `createTaskTools(supabase, clientId)`

## Verbatim Definition

```typescript
const search_tasks = tool({
  description:
    "Search CRM tasks. Optionally filter by status, contact id, or deal id.",
  inputSchema: z.object({
    status: z.enum(crmTaskStatusValues).optional().describe("Optional task status filter."),
    contact_id: z.string().uuid().optional().describe("Optional contact id filter."),
    deal_id: z.string().uuid().optional().describe("Optional deal id filter."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum results to return. Defaults to 20."),
  }),
  execute: async ({ status, contact_id, deal_id, limit }) => {
    const maxResults = limit ?? DEFAULT_RESULT_LIMIT;
    let queryBuilder = supabase.from("crm_tasks").select("*");

    if (status) {
      queryBuilder = queryBuilder.eq("status", status);
    }

    if (contact_id) {
      queryBuilder = queryBuilder.eq("contact_id", contact_id);
    }

    if (deal_id) {
      queryBuilder = queryBuilder.eq("deal_id", deal_id);
    }

    const { data, error } = await queryBuilder
      .order("due_date", { ascending: true })
      .limit(maxResults);

    if (error) {
      return { success: false as const, error: error.message };
    }

    const tasks = data ?? [];

    return {
      success: true as const,
      tasks,
      count: tasks.length,
    };
  },
});
```

## Input Schema

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | `enum` | No | open, completed |
| `contact_id` | `string (uuid)` | No | Filter by associated contact |
| `deal_id` | `string (uuid)` | No | Filter by associated deal |
| `limit` | `integer` | No | 1–50, defaults to 20 |

## Result Shape

```typescript
// Success
{ success: true, tasks: CrmTask[], count: number }

// Error
{ success: false, error: string }
```

## Notes

- No free-text search — filter-only (status, contact, deal)
- Ordered by `due_date` ascending (soonest first)
- All parameters optional — calling with no args returns up to 20 tasks ordered by due date
