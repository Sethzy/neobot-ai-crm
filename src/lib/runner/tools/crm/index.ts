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
import { createTaskTools } from "./tasks";

interface CreateCrmToolsOptions {
  /** Explicit CRM tool mode for the current run. */
  mode?: "normal" | "setup";
  /** Runtime CRM vocabulary/custom-field config for normal mode. */
  config?: CrmVocabConfig;
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
  const {
    allowWriteTools = true,
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
  const taskTools = createTaskTools(supabase, clientId, config);

  const readTools = {
    search_companies: companyTools.search_companies,
    search_contacts: contactTools.search_contacts,
    search_deals: dealTools.search_deals,
    search_tasks: taskTools.search_tasks,
    get_deal_contacts: dealContactTools.get_deal_contacts,
  };

  if (!allowWriteTools) {
    return readTools;
  }

  // Note: Delete tools are intentionally omitted in v1. Deletion is a
  // high-risk action better handled through the Supabase dashboard until
  // the approval gate (PR 33) ships. See 03-sunder-crm-vs-hubspot-tool-comparison.md.
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
  };
}
