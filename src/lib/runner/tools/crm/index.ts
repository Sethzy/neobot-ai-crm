/**
 * CRM tool factory barrel for the runner.
 * @module lib/runner/tools/crm
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { CRM_DEFAULTS, type CrmVocabConfig } from "@/lib/crm/config";
import type { Database } from "@/types/database";

import { createCompanyLinkTools } from "./company-links";
import { createCompanyTools } from "./companies";
import { createContactTools } from "./contacts";
import { createConfigureCrmTool } from "./configure-crm";
import { createDealContactTools } from "./deal-contacts";
import { createDealTools } from "./deals";
import { createInteractionTools } from "./interactions";
import { createSchemaTools } from "./schema";
import { createTaskTools } from "./tasks";

interface CreateCrmToolsOptions {
  /** Explicit CRM tool mode for the current run. */
  mode?: "normal" | "setup";
  /** Runtime CRM vocabulary/custom-field config for normal mode. */
  config?: CrmVocabConfig;
  /**
   * Enables mutating CRM tools for the active run.
   */
  allowWriteTools?: boolean;
  /**
   * Deliberate RUNNER-06 exception: subagents cannot surface approval cards,
   * so approval-gated delete tools can be withheld from their registry.
   */
  allowDeleteTools?: boolean;
}

/**
 * Creates all CRM tools for registration in `streamText({ tools })`.
 */
export function createCrmTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  options?: CreateCrmToolsOptions,
) {
  const {
    allowWriteTools = true,
    allowDeleteTools = true,
    mode = "normal",
    config = CRM_DEFAULTS,
  } = options ?? {};

  if (mode === "setup") {
    return createConfigureCrmTool(supabase, clientId);
  }

  const companyTools = createCompanyTools(supabase, clientId, config);
  const companyLinkTools = createCompanyLinkTools(supabase, clientId);
  const contactTools = createContactTools(supabase, clientId, config);
  const dealTools = createDealTools(supabase, clientId, config);
  const dealContactTools = createDealContactTools(supabase, clientId, config);
  const interactionTools = createInteractionTools(supabase, clientId, config);
  const schemaTools = createSchemaTools(config);
  const taskTools = createTaskTools(supabase, clientId, config);

  const readTools = {
    search_companies: companyTools.search_companies,
    search_contacts: contactTools.search_contacts,
    search_deals: dealTools.search_deals,
    search_interactions: interactionTools.search_interactions,
    search_tasks: taskTools.search_tasks,
    describe_crm_schema: schemaTools.describe_crm_schema,
    get_deal_contacts: dealContactTools.get_deal_contacts,
    get_contact_deals: dealContactTools.get_contact_deals,
    get_company_contacts: companyLinkTools.get_company_contacts,
    get_company_deals: companyLinkTools.get_company_deals,
  };

  if (!allowWriteTools) {
    return readTools;
  }

  return {
    ...readTools,
    create_company: companyTools.create_company,
    update_company: companyTools.update_company,
    batch_create_companies: companyTools.batch_create_companies,
    create_contact: contactTools.create_contact,
    update_contact: contactTools.update_contact,
    batch_create_contacts: contactTools.batch_create_contacts,
    create_deal: dealTools.create_deal,
    update_deal: dealTools.update_deal,
    batch_create_deals: dealTools.batch_create_deals,
    link_contact_to_company: companyLinkTools.link_contact_to_company,
    unlink_contact_from_company: companyLinkTools.unlink_contact_from_company,
    link_deal_to_company: companyLinkTools.link_deal_to_company,
    unlink_deal_from_company: companyLinkTools.unlink_deal_from_company,
    link_contact_to_deal: dealContactTools.link_contact_to_deal,
    unlink_contact_from_deal: dealContactTools.unlink_contact_from_deal,
    create_interaction: interactionTools.create_interaction,
    create_task: taskTools.create_task,
    update_task: taskTools.update_task,
    ...(allowDeleteTools ? {
      delete_company: companyTools.delete_company,
      delete_contact: contactTools.delete_contact,
      delete_deal: dealTools.delete_deal,
      delete_interaction: interactionTools.delete_interaction,
      delete_task: taskTools.delete_task,
    } : {}),
  };
}
