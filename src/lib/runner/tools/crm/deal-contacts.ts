/**
 * CRM deal-contact linking tools for the runner.
 * @module lib/runner/tools/crm/deal-contacts
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { dealContactRoleValues } from "@/lib/crm/schemas";
import type { Database } from "@/types/database";

/**
 * Creates deal-contact linking tools.
 *
 * These tools manage the many-to-many relationship between deals and contacts
 * via the deal_contacts join table.
 */
export function createDealContactTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const link_contact_to_deal = tool({
    description:
      "Link a contact to a deal with a role (buyer, seller, agent, other). " +
      "A deal can have multiple contacts. Each contact-deal pair must be unique. " +
      "Use search_contacts and search_deals to find IDs first. " +
      "Data Modification Warning: Only link contacts when the user has explicitly asked to do so.",
    inputSchema: z.object({
      deal_id: z.string().uuid().describe("UUID of the deal. Use search_deals to find this."),
      contact_id: z.string().uuid().describe("UUID of the contact. Use search_contacts to find this."),
      role: z.enum(dealContactRoleValues).optional()
        .describe("Contact's role in the deal (buyer, seller, agent, other). Defaults to 'buyer'."),
      is_primary: z.boolean().optional()
        .describe("Whether this is the primary contact for display. Defaults to false."),
    }),
    execute: async ({ deal_id, contact_id, role, is_primary }) => {
      const { data, error } = await supabase
        .from("deal_contacts")
        .insert({
          client_id: clientId,
          deal_id,
          contact_id,
          role: role ?? "buyer",
          is_primary: is_primary ?? false,
        })
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, deal_contact: data };
    },
  });

  const unlink_contact_from_deal = tool({
    description:
      "Remove a contact from a deal. This permanently deletes the link. " +
      "Use get_deal_contacts to see current links first. " +
      "Data Modification Warning: Only unlink contacts when the user has explicitly asked to do so.",
    inputSchema: z.object({
      deal_id: z.string().uuid().describe("UUID of the deal."),
      contact_id: z.string().uuid().describe("UUID of the contact to unlink."),
    }),
    execute: async ({ deal_id, contact_id }) => {
      const { data, error } = await supabase
        .from("deal_contacts")
        .delete()
        .eq("deal_id", deal_id)
        .eq("contact_id", contact_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        const isNoRows = error.code === "PGRST116";

        return {
          success: false as const,
          error: isNoRows
            ? "No link found between this contact and deal"
            : error.message,
        };
      }

      return { success: true as const, removed: data };
    },
  });

  const get_deal_contacts = tool({
    description:
      "Get all contacts linked to a deal with their roles (buyer, seller, agent, other) and primary status. " +
      "Returns contact details (name, email, phone) for each link. " +
      "Use this to see who is involved in a deal before linking or unlinking contacts.",
    inputSchema: z.object({
      deal_id: z.string().uuid().describe("UUID of the deal."),
    }),
    execute: async ({ deal_id }) => {
      const { data, error } = await supabase
        .from("deal_contacts")
        .select("*, contacts(first_name, last_name, email, phone)")
        .eq("deal_id", deal_id);

      if (error) {
        return { success: false as const, error: error.message };
      }

      const deal_contacts = data ?? [];

      return {
        success: true as const,
        deal_contacts,
        count: deal_contacts.length,
      };
    },
  });

  return {
    link_contact_to_deal,
    unlink_contact_from_deal,
    get_deal_contacts,
  };
}
