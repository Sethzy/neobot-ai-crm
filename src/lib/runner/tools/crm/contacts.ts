/**
 * CRM contact tools for the runner.
 * @module lib/runner/tools/crm/contacts
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { contactTypeValues } from "@/lib/crm/schemas";
import type { Database } from "@/types/database";

import { buildIlikePattern, buildSearchExpression, DEFAULT_CRM_RESULT_LIMIT } from "./filter-utils";

const CONTACT_SEARCH_COLUMNS = ["first_name", "last_name", "email", "phone"];

/**
 * Searches for existing contacts matching first_name AND last_name (case-insensitive).
 * Returns matched rows or `null` on query error (best-effort — callers should fall through on null).
 */
async function findDuplicateContacts(
  supabase: SupabaseClient<Database>,
  firstName: string,
  lastName: string,
): Promise<unknown[] | null> {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .ilike("first_name", buildIlikePattern(firstName))
    .ilike("last_name", buildIlikePattern(lastName))
    .limit(10);

  if (error) return null;
  return data ?? [];
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
      const maxResults = limit ?? DEFAULT_CRM_RESULT_LIMIT;

      let queryBuilder = supabase
        .from("contacts")
        .select("*");

      if (query) {
        queryBuilder = queryBuilder.or(buildSearchExpression(query, CONTACT_SEARCH_COLUMNS));
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
      "Create a new contact. Has built-in duplicate detection — if a contact with a matching name already exists, " +
      "returns possible_duplicates instead of creating. Review the candidates and use update_contact on the existing " +
      "record, or re-call with force_create: true to override. " +
      "Data Modification Warning: Only create contacts when the user has explicitly asked to do so.",
    inputSchema: z.object({
      first_name: z.string().min(1).describe("Contact first name."),
      last_name: z.string().min(1).describe("Contact last name."),
      email: z.string().email().optional().describe("Contact email address."),
      phone: z.string().min(1).optional().describe("Contact phone number."),
      type: z.enum(contactTypeValues).optional().describe("Contact classification (buyer, seller, landlord, tenant, agent, other). Defaults to 'other'."),
      notes: z.string().optional().describe("Free-form contact notes."),
      force_create: z.boolean().optional().describe("Set to true to skip duplicate detection and create the contact regardless."),
    }),
    execute: async ({ first_name, last_name, email, phone, type, notes, force_create }) => {
      // Dedup check (best-effort — search failure falls through to insert)
      if (!force_create) {
        const duplicates = await findDuplicateContacts(supabase, first_name, last_name);
        if (duplicates && duplicates.length > 0) {
          return {
            success: false as const,
            reason: "possible_duplicates" as const,
            possible_duplicates: duplicates,
            message: `Found ${duplicates.length} existing contact(s) matching "${first_name} ${last_name}". Review and use update_contact, or re-call with force_create: true.`,
          };
        }
      }

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

  const batch_create_contacts = tool({
    description:
      "Create multiple contacts in a single call. Has built-in duplicate detection — checks for intra-batch " +
      "duplicates (same name appearing twice) and existing records with matching names. If any duplicates found, " +
      "returns possible_duplicates for all entries without inserting. Use force_create: true to override. " +
      "Data Modification Warning: Only create contacts when the user has explicitly asked to do so.",
    inputSchema: z.object({
      contacts: z
        .array(
          z.object({
            first_name: z.string().min(1).describe("Contact first name."),
            last_name: z.string().min(1).describe("Contact last name."),
            email: z.string().email().optional().describe("Contact email address."),
            phone: z.string().min(1).optional().describe("Contact phone number."),
            type: z.enum(contactTypeValues).optional().describe("Contact classification (buyer, seller, landlord, tenant, agent, other). Defaults to 'other'."),
            notes: z.string().optional().describe("Free-form contact notes."),
          }),
        )
        .min(1)
        .max(50)
        .describe("Array of contacts to create (1-50 per call)."),
      force_create: z.boolean().optional().describe("Set to true to skip duplicate detection for the entire batch."),
    }),
    execute: async ({ contacts, force_create }) => {
      if (!force_create) {
        // Check intra-batch duplicates (same first+last name appears twice)
        const nameKeys = contacts.map((c) => `${c.first_name.toLowerCase()}|${c.last_name.toLowerCase()}`);
        const seen = new Set<string>();
        const intraDupes: string[] = [];
        for (const key of nameKeys) {
          if (seen.has(key)) {
            intraDupes.push(key);
          }
          seen.add(key);
        }

        if (intraDupes.length > 0) {
          const dupeNames = [...new Set(intraDupes)].map((k) => k.replace("|", " "));
          return {
            success: false as const,
            reason: "possible_duplicates" as const,
            possible_duplicates: [],
            message: `Intra-batch duplicates detected: ${dupeNames.join(", ")}. Remove duplicates or use force_create: true.`,
          };
        }

        // Check each entry against existing records
        const allDuplicates: Array<{ input: { first_name: string; last_name: string }; existing: unknown[] }> = [];
        for (const contact of contacts) {
          const duplicates = await findDuplicateContacts(supabase, contact.first_name, contact.last_name);
          if (duplicates && duplicates.length > 0) {
            allDuplicates.push({ input: { first_name: contact.first_name, last_name: contact.last_name }, existing: duplicates });
          }
        }

        if (allDuplicates.length > 0) {
          return {
            success: false as const,
            reason: "possible_duplicates" as const,
            possible_duplicates: allDuplicates,
            message: `Found existing contacts matching ${allDuplicates.length} entries. Review and use update_contact, or re-call with force_create: true.`,
          };
        }
      }

      const rows = contacts.map((c) => ({
        client_id: clientId,
        first_name: c.first_name,
        last_name: c.last_name,
        type: c.type ?? "other",
        email: c.email ?? null,
        phone: c.phone ?? null,
        notes: c.notes ?? null,
      }));

      const { data, error } = await supabase
        .from("contacts")
        .insert(rows)
        .select();

      if (error) {
        return { success: false as const, error: error.message };
      }

      const created = data ?? [];

      return {
        success: true as const,
        contacts: created,
        count: created.length,
      };
    },
  });

  return {
    search_contacts,
    create_contact,
    update_contact,
    batch_create_contacts,
  };
}
