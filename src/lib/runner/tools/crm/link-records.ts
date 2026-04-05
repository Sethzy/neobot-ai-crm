/**
 * Unified CRM record linking tool — replaces 6 per-relationship link/unlink tools.
 * @module lib/runner/tools/crm/link-records
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CRM_DEFAULTS, type CrmVocabConfig } from "@/lib/crm/config";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import type { Database } from "@/types/database";

/** Supported relationship types. */
const RELATIONSHIPS = ["contact_deal", "contact_company", "deal_company"] as const;

/**
 * Creates the link_records tool.
 */
export function createLinkRecordsTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
  config: CrmVocabConfig = CRM_DEFAULTS,
) {
  const defaultRole = config.deal_contact_roles.includes("buyer")
    ? "buyer"
    : config.deal_contact_roles[0];

  return {
    link_records: tool({
      description:
        "Create or remove a relationship between two CRM records. " +
        "Supported relationships: contact↔deal (many-to-many via junction table, with role and primary flag), " +
        "contact→company (FK on contact), deal→company (FK on deal). " +
        "Data Modification Warning: Only link/unlink when the user has explicitly asked.",
      inputSchema: z.object({
        action: z.enum(["link", "unlink"]).describe("Whether to create or remove the relationship."),
        relationship: z.enum(RELATIONSHIPS).describe("Which relationship to modify."),
        source_id: z
          .string()
          .uuid()
          .describe(
            "UUID of the source record (contact_id for contact_deal and contact_company, deal_id for deal_company).",
          ),
        target_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "UUID of the target record (deal_id, company_id). Required for 'link'. Omit for 'unlink' on FK relationships.",
          ),
        role: z
          .string()
          .optional()
          .describe("Role for contact↔deal links (e.g., buyer, seller). See CRM schema for valid roles."),
        is_primary: z
          .boolean()
          .optional()
          .describe("Whether this is the primary contact for display. Only for contact↔deal links."),
      }),
      execute: async ({ action, relationship, source_id, target_id, role, is_primary }) => {
        switch (relationship) {
          case "contact_deal":
            return action === "link"
              ? linkContactDeal(supabase, clientId, source_id, target_id, role ?? defaultRole, is_primary ?? false)
              : unlinkContactDeal(supabase, clientId, source_id, target_id);

          case "contact_company":
            return action === "link"
              ? linkFk(supabase, clientId, "contacts", "contact_id", source_id, "company_id", target_id)
              : unlinkFk(supabase, clientId, "contacts", "contact_id", source_id, "company_id");

          case "deal_company":
            return action === "link"
              ? linkFk(supabase, clientId, "deals", "deal_id", source_id, "company_id", target_id)
              : unlinkFk(supabase, clientId, "deals", "deal_id", source_id, "company_id");
        }
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// contact_deal: junction table operations
// ---------------------------------------------------------------------------

async function linkContactDeal(
  supabase: SupabaseClient<Database>,
  clientId: string,
  contactId: string,
  dealId: string | undefined,
  role: string,
  isPrimary: boolean,
) {
  if (!dealId) {
    return { success: false as const, error: "target_id (deal_id) is required to link a contact to a deal." };
  }

  const { data, error } = await supabase
    .from("deal_contacts")
    .insert({
      client_id: clientId,
      contact_id: contactId,
      deal_id: dealId,
      role,
      is_primary: isPrimary,
    })
    .select()
    .single();

  if (error) {
    return { success: false as const, error: error.message };
  }

  return { success: true as const, link: data };
}

async function unlinkContactDeal(
  supabase: SupabaseClient<Database>,
  clientId: string,
  contactId: string,
  dealId: string | undefined,
) {
  if (!dealId) {
    return { success: false as const, error: "target_id (deal_id) is required to unlink a contact from a deal." };
  }

  const { data, error } = await supabase
    .from("deal_contacts")
    .delete()
    .eq("deal_id", dealId)
    .eq("contact_id", contactId)
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
}

// ---------------------------------------------------------------------------
// FK relationships: contact→company, deal→company
// ---------------------------------------------------------------------------

async function linkFk(
  supabase: SupabaseClient<Database>,
  clientId: string,
  table: "contacts" | "deals",
  pk: string,
  sourceId: string,
  fkColumn: string,
  targetId: string | undefined,
) {
  if (!targetId) {
    return { success: false as const, error: `target_id (${fkColumn.replace("_id", "")}_id) is required to link.` };
  }

  const { data: existingRecord, error: readError } = await supabase
    .from(table)
    .select("*")
    .eq(pk, sourceId)
    .eq("client_id", clientId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from(table)
    .update({ [fkColumn]: targetId })
    .eq(pk, sourceId)
    .eq("client_id", clientId)
    .select()
    .single();

  if (error) {
    return { success: false as const, error: error.message };
  }

  if (!readError && existingRecord) {
    void captureTimelineActivity({
      supabase,
      clientId,
      recordType: table === "contacts" ? "contact" : "deal",
      recordId: sourceId,
      action: "updated",
      actorType: "agent",
      before: existingRecord as Record<string, unknown>,
      after: data as Record<string, unknown>,
    });
  }

  return { success: true as const, link: data };
}

async function unlinkFk(
  supabase: SupabaseClient<Database>,
  clientId: string,
  table: "contacts" | "deals",
  pk: string,
  sourceId: string,
  fkColumn: string,
) {
  const { data: existingRecord, error: readError } = await supabase
    .from(table)
    .select("*")
    .eq(pk, sourceId)
    .eq("client_id", clientId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from(table)
    .update({ [fkColumn]: null })
    .eq(pk, sourceId)
    .eq("client_id", clientId)
    .select()
    .single();

  if (error) {
    return { success: false as const, error: error.message };
  }

  if (!readError && existingRecord) {
    void captureTimelineActivity({
      supabase,
      clientId,
      recordType: table === "contacts" ? "contact" : "deal",
      recordId: sourceId,
      action: "updated",
      actorType: "agent",
      before: existingRecord as Record<string, unknown>,
      after: data as Record<string, unknown>,
    });
  }

  return { success: true as const, removed: data };
}
