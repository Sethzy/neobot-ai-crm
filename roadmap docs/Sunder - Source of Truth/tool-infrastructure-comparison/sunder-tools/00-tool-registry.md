# Tool Registry & Factory Barrel

- Source: `src/lib/runner/tools/index.ts`
- Pattern: Category barrel → factory functions → merged into single tools object

## Top-Level Barrel

```typescript
/**
 * Tool category barrel for the runner.
 * @module lib/runner/tools
 */
export { createCrmTools } from "./crm";
export { createStorageTools } from "./storage";
export { createWebTools } from "./web";
```

## CRM Factory (Barrel)

Source: `src/lib/runner/tools/crm/index.ts`

```typescript
/**
 * CRM tool factory barrel for the runner.
 * @module lib/runner/tools/crm
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { createContactTools } from "./contacts";
import { createDealTools } from "./deals";
import { createInteractionTools } from "./interactions";
import { createTaskTools } from "./tasks";

interface CreateCrmToolsOptions {
  /**
   * Enables mutating CRM tools. Always true in v1; prompt-level approval
   * provides interim safety until the PR 33 approval gate ships.
   */
  allowWriteTools?: boolean;
}

/**
 * Creates all CRM tools for registration in `streamText({ tools })`.
 */
export function createCrmTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  options?: CreateCrmToolsOptions,
) {
  const contactTools = createContactTools(supabase, clientId);
  const dealTools = createDealTools(supabase, clientId);
  const interactionTools = createInteractionTools(supabase, clientId);
  const taskTools = createTaskTools(supabase, clientId);

  const readTools = {
    search_contacts: contactTools.search_contacts,
    search_deals: dealTools.search_deals,
    search_tasks: taskTools.search_tasks,
  };

  if (!options?.allowWriteTools) {
    return readTools;
  }

  return {
    ...readTools,
    create_contact: contactTools.create_contact,
    update_contact: contactTools.update_contact,
    create_deal: dealTools.create_deal,
    update_deal: dealTools.update_deal,
    create_interaction: interactionTools.create_interaction,
    create_task: taskTools.create_task,
    update_task: taskTools.update_task,
  };
}
```

## Web Factory (Barrel)

Source: `src/lib/runner/tools/web/index.ts`

```typescript
/**
 * Web tool factory barrel for runner registration.
 * @module lib/runner/tools/web
 */
import { createScrapeTool } from "./scrape";
import { createSearchTool } from "./search";

/**
 * Creates all web utility tools for the runner.
 */
export function createWebTools() {
  return {
    ...createSearchTool(),
    ...createScrapeTool(),
  };
}
```

## How Tools Are Merged (in run-agent.ts)

```typescript
const crmTools = createCrmTools(supabase, clientId, {
  allowWriteTools: true,
});
const storageTools = createStorageTools(supabase, clientId);
const webTools = createWebTools();
const tools = {
  ...crmTools,
  ...storageTools,
  ...webTools,
};

const streamResult = streamText({
  model: gateway(modelId),
  system,
  messages,
  stopWhen: stepCountIs(MAX_STEPS_TIER_1),  // 8
  tools,
  onFinish: async ({ steps, totalUsage }) => { /* ... */ },
});
```
