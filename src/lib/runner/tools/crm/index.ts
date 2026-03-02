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
   * Enables mutating CRM tools. Keep disabled until approval orchestration is enforced.
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
