/**
 * CRM contact tools for the runner.
 * @module lib/runner/tools/crm/contacts
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { contactTypeValues } from "@/lib/crm/schemas";
import type { Database } from "@/types/database";

import { buildContainsIlikeLiteral } from "./filter-utils";

const DEFAULT_RESULT_LIMIT = 20;

function buildSearchExpression(query: string): string {
  const ilikeLiteral = buildContainsIlikeLiteral(query);

  return [
    `first_name.ilike.${ilikeLiteral}`,
    `last_name.ilike.${ilikeLiteral}`,
    `email.ilike.${ilikeLiteral}`,
    `phone.ilike.${ilikeLiteral}`,
  ].join(",");
}

/**
 * Creates contact-related CRM tools.
 *
 * The factory closes over `clientId` so the LLM never provides tenant identity.
 */
export function createContactTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const search_contacts = tool({
    description:
      "Search contacts by name, email, or phone. Use this before creating a new contact to avoid duplicates. " +
      "Omit query to list all contacts. Searches across first_name, last_name, email, and phone using OR matching.",
    inputSchema: z.object({
      query: z.string().trim().min(1).optional().describe("Search term for name, email, or phone. Omit to list all contacts."),
      type: z.enum(contactTypeValues).optional().describe("Contact type filter (buyer, seller, landlord, tenant, agent, other)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum results to return. Defaults to 20."),
    }),
    execute: async ({ query, type, limit }) => {
      const maxResults = limit ?? DEFAULT_RESULT_LIMIT;

      let queryBuilder = supabase
        .from("contacts")
        .select("*");

      if (query) {
        queryBuilder = queryBuilder.or(buildSearchExpression(query));
      }

      if (type) {
        queryBuilder = queryBuilder.eq("type", type);
      }

      const { data, error } = await queryBuilder.limit(maxResults);

      if (error) {
        return { success: false as const, error: error.message };
      }

      const contacts = data ?? [];

      return {
        success: true as const,
        contacts,
        count: contacts.length,
      };
    },
  });

  const create_contact = tool({
    description:
      "Create a new contact. Use search_contacts first to avoid duplicates. " +
      "Data Modification Warning: Only create contacts when the user has explicitly asked to do so.",
    inputSchema: z.object({
      first_name: z.string().min(1).describe("Contact first name."),
      last_name: z.string().min(1).describe("Contact last name."),
      email: z.string().email().optional().describe("Contact email address."),
      phone: z.string().min(1).optional().describe("Contact phone number."),
      type: z.enum(contactTypeValues).optional().describe("Contact classification (buyer, seller, landlord, tenant, agent, other). Defaults to 'other'."),
      notes: z.string().optional().describe("Free-form contact notes."),
    }),
    execute: async ({ first_name, last_name, email, phone, type, notes }) => {
      const { data, error } = await supabase
        .from("contacts")
        .insert({
          client_id: clientId,
          first_name,
          last_name,
          type: type ?? "other",
          email: email ?? null,
          phone: phone ?? null,
          notes: notes ?? null,
        })
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return {
        success: true as const,
        contact: data,
      };
    },
  });

  const update_contact = tool({
    description:
      "Update an existing contact by id. Use this after finding the contact via search_contacts. " +
      "Only provided fields are updated. Omit fields you don't want to change. Pass null to clear a nullable field. " +
      "Data Modification Warning: Only update contacts when the user has explicitly asked to do so.",
    inputSchema: z.object({
      contact_id: z.string().uuid().describe("UUID of the contact to update. Use search_contacts to find this."),
      first_name: z.string().min(1).optional().describe("Updated first name."),
      last_name: z.string().min(1).optional().describe("Updated last name."),
      email: z.string().email().nullable().optional().describe("Updated email or null to clear."),
      phone: z.string().min(1).nullable().optional().describe("Updated phone or null to clear."),
      type: z.enum(contactTypeValues).optional().describe("Updated contact type."),
      notes: z.string().nullable().optional().describe("Updated notes or null to clear."),
    }),
    execute: async ({ contact_id, ...fields }) => {
      const updates = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      );

      if (Object.keys(updates).length === 0) {
        return { success: false as const, error: "No fields to update" };
      }

      const { data, error } = await supabase
        .from("contacts")
        .update(updates)
        .eq("contact_id", contact_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return {
        success: true as const,
        contact: data,
      };
    },
  });

  return {
    search_contacts,
    create_contact,
    update_contact,
  };
}
