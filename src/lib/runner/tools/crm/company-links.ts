/**
 * CRM company-linking tools for contacts and deals.
 * @module lib/runner/tools/crm/company-links
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

/**
 * Creates company-link tools for direct contact/deal foreign keys.
 */
export function createCompanyLinkTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const link_contact_to_company = tool({
    description:
      "Link a contact to a company. Use search_contacts and search_companies to find the ids first. " +
      "Data Modification Warning: Only link records when the user has explicitly asked to do so.",
    inputSchema: z.object({
      contact_id: z.string().uuid().describe("UUID of the contact to link."),
      company_id: z.string().uuid().describe("UUID of the company to link."),
    }),
    execute: async ({ contact_id, company_id }) => {
      const { data, error } = await supabase
        .from("contacts")
        .update({ company_id })
        .eq("contact_id", contact_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, contact: data };
    },
  });

  const unlink_contact_from_company = tool({
    description:
      "Remove the linked company from a contact. " +
      "Data Modification Warning: Only unlink records when the user has explicitly asked to do so.",
    inputSchema: z.object({
      contact_id: z.string().uuid().describe("UUID of the contact to unlink."),
    }),
    execute: async ({ contact_id }) => {
      const { data, error } = await supabase
        .from("contacts")
        .update({ company_id: null })
        .eq("contact_id", contact_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, contact: data };
    },
  });

  const link_deal_to_company = tool({
    description:
      "Link a deal to a company. Use search_deals and search_companies to find the ids first. " +
      "Data Modification Warning: Only link records when the user has explicitly asked to do so.",
    inputSchema: z.object({
      deal_id: z.string().uuid().describe("UUID of the deal to link."),
      company_id: z.string().uuid().describe("UUID of the company to link."),
    }),
    execute: async ({ deal_id, company_id }) => {
      const { data, error } = await supabase
        .from("deals")
        .update({ company_id })
        .eq("deal_id", deal_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, deal: data };
    },
  });

  const unlink_deal_from_company = tool({
    description:
      "Remove the linked company from a deal. " +
      "Data Modification Warning: Only unlink records when the user has explicitly asked to do so.",
    inputSchema: z.object({
      deal_id: z.string().uuid().describe("UUID of the deal to unlink."),
    }),
    execute: async ({ deal_id }) => {
      const { data, error } = await supabase
        .from("deals")
        .update({ company_id: null })
        .eq("deal_id", deal_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, deal: data };
    },
  });

  return {
    link_contact_to_company,
    unlink_contact_from_company,
    link_deal_to_company,
    unlink_deal_from_company,
  };
}
