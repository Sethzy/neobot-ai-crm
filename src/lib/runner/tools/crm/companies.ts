/**
 * CRM company tools for the runner.
 * @module lib/runner/tools/crm/companies
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  buildCustomFieldsSchema,
  CRM_DEFAULTS,
  type CrmVocabConfig,
} from "@/lib/crm/config";
import type { Database, JsonObject } from "@/types/database";

import { mergeCustomFields } from "./custom-fields";
import {
  buildIlikePattern,
  buildSearchExpression,
  DEFAULT_CRM_RESULT_LIMIT,
} from "./filter-utils";

const COMPANY_SEARCH_COLUMNS = ["name", "website", "phone", "email", "address", "notes"];
type CompanyUpdate = Database["public"]["Tables"]["companies"]["Update"];

/**
 * Searches for existing companies matching name (case-insensitive).
 * Returns matched rows or `null` on query error so create can fall through.
 */
async function findDuplicateCompanies(
  supabase: SupabaseClient<Database>,
  name: string,
): Promise<unknown[] | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .ilike("name", buildIlikePattern(name))
    .limit(10);

  if (error) {
    return null;
  }

  return data ?? [];
}

/**
 * Creates company-related CRM tools.
 *
 * The factory closes over `clientId` so tenant identity stays server-side.
 */
export function createCompanyTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  config: CrmVocabConfig = CRM_DEFAULTS,
) {
  const companyIndustryEnum = z.enum(config.company_industries as [string, ...string[]]);
  const industryList = config.company_industries.join(", ");
  const pluralLabel = `${config.company_label}s`;

  const search_companies = tool({
    description:
      `Search ${pluralLabel} by name, website, phone, email, address, or notes. ` +
      "Use this before creating a new company to avoid duplicates. " +
      `Optionally filter by industry (${industryList}). ` +
      `Omit query to list all ${pluralLabel}.`,
    inputSchema: z.object({
      query: z.string().trim().min(1).optional().describe("Search term for company name, website, phone, email, address, or notes."),
      industry: companyIndustryEnum.optional().describe(`Company industry filter (${industryList}).`),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum results to return. Defaults to 20."),
    }),
    execute: async ({ query, industry, limit }) => {
      const maxResults = limit ?? DEFAULT_CRM_RESULT_LIMIT;
      let queryBuilder = supabase.from("companies").select("*");

      if (query) {
        queryBuilder = queryBuilder.or(buildSearchExpression(query, COMPANY_SEARCH_COLUMNS));
      }

      if (industry) {
        queryBuilder = queryBuilder.eq("industry", industry);
      }

      const { data, error } = await queryBuilder.limit(maxResults);

      if (error) {
        return { success: false as const, error: error.message };
      }

      const companies = data ?? [];

      return {
        success: true as const,
        companies,
        count: companies.length,
      };
    },
  });

  const create_company = tool({
    description:
      `Create a new ${config.company_label}. Has built-in duplicate detection — if a ${config.company_label.toLowerCase()} with a matching name already exists, ` +
      "returns possible_duplicates instead of creating. Review the candidates and use update_company on the existing " +
      "record, or re-call with force_create: true to override. " +
      `Valid industries: ${industryList}. ` +
      `Data Modification Warning: Only create ${pluralLabel.toLowerCase()} when the user has explicitly asked to do so.`,
    inputSchema: z.object({
      name: z.string().min(1).describe(`Name of the ${config.company_label.toLowerCase()}.`),
      industry: companyIndustryEnum.optional().describe(`Company industry (${industryList}).`),
      website: z.string().url().optional().describe("Company website."),
      phone: z.string().min(1).optional().describe("Company phone number."),
      email: z.string().email().optional().describe("Company email address."),
      address: z.string().min(1).optional().describe("Company address."),
      notes: z.string().optional().describe("Free-form company notes."),
      custom_fields: buildCustomFieldsSchema(config.company_custom_fields).optional()
        .describe(`Configured custom fields for ${pluralLabel.toLowerCase()}.`),
      force_create: z.boolean().optional().describe("Set to true to skip duplicate detection and create the company regardless."),
    }),
    execute: async ({
      name,
      industry,
      website,
      phone,
      email,
      address,
      notes,
      custom_fields,
      force_create,
    }) => {
      if (!force_create) {
        const duplicates = await findDuplicateCompanies(supabase, name);
        if (duplicates && duplicates.length > 0) {
          return {
            success: false as const,
            reason: "possible_duplicates" as const,
            possible_duplicates: duplicates,
            message: `Found ${duplicates.length} existing company record(s) matching "${name}". Review and use update_company, or re-call with force_create: true.`,
          };
        }
      }

      const { data, error } = await supabase
        .from("companies")
        .insert({
          client_id: clientId,
          name,
          industry: industry ?? null,
          website: website ?? null,
          phone: phone ?? null,
          email: email ?? null,
          address: address ?? null,
          notes: notes ?? null,
          custom_fields: custom_fields ?? {},
        })
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return {
        success: true as const,
        company: data,
      };
    },
  });

  const update_company = tool({
    description:
      `Update an existing ${config.company_label.toLowerCase()} by id. Use this after finding it via search_companies. ` +
      "Only provided fields are updated. Omit fields you don't want to change. Pass null to clear a nullable field. " +
      `Valid industries: ${industryList}. ` +
      `Data Modification Warning: Only update ${pluralLabel.toLowerCase()} when the user has explicitly asked to do so.`,
    inputSchema: z.object({
      company_id: z.string().uuid().describe("UUID of the company to update. Use search_companies to find this."),
      name: z.string().min(1).optional().describe("Updated company name."),
      industry: companyIndustryEnum.nullable().optional().describe("Updated company industry or null to clear."),
      website: z.string().url().nullable().optional().describe("Updated website or null to clear."),
      phone: z.string().min(1).nullable().optional().describe("Updated phone or null to clear."),
      email: z.string().email().nullable().optional().describe("Updated email or null to clear."),
      address: z.string().nullable().optional().describe("Updated address or null to clear."),
      notes: z.string().nullable().optional().describe("Updated notes or null to clear."),
      custom_fields: buildCustomFieldsSchema(config.company_custom_fields, "update").optional()
        .describe(`Partial custom field patch for ${pluralLabel.toLowerCase()}.`),
    }),
    execute: async ({ company_id, ...fields }) => {
      const updates = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      ) as CompanyUpdate;

      if (Object.keys(updates).length === 0) {
        return { success: false as const, error: "No fields to update" };
      }

      if ("custom_fields" in updates) {
        const result = await mergeCustomFields(
          supabase,
          "companies",
          "company_id",
          company_id,
          clientId,
          (updates.custom_fields as JsonObject | undefined) ?? {},
        );
        if (result.error) {
          return { success: false as const, error: result.error };
        }
        updates.custom_fields = result.merged;
      }

      const { data, error } = await supabase
        .from("companies")
        .update(updates)
        .eq("company_id", company_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return {
        success: true as const,
        company: data,
      };
    },
  });

  const batch_create_companies = tool({
    description:
      `Create multiple ${pluralLabel.toLowerCase()} in a single call. ` +
      `Data Modification Warning: Only create ${pluralLabel.toLowerCase()} when the user has explicitly asked to do so.`,
    inputSchema: z.object({
      companies: z
        .array(
          z.object({
            name: z.string().min(1).describe(`Name of the ${config.company_label.toLowerCase()}.`),
            industry: companyIndustryEnum.optional().describe(`Company industry (${industryList}).`),
            website: z.string().url().optional().describe("Company website."),
            phone: z.string().min(1).optional().describe("Company phone number."),
            email: z.string().email().optional().describe("Company email address."),
            address: z.string().min(1).optional().describe("Company address."),
            notes: z.string().optional().describe("Free-form company notes."),
            custom_fields: buildCustomFieldsSchema(config.company_custom_fields).optional()
              .describe(`Configured custom fields for ${pluralLabel.toLowerCase()}.`),
          }),
        )
        .min(1)
        .max(50)
        .describe("Array of companies to create (1-50 per call)."),
    }),
    execute: async ({ companies }) => {
      const rows = companies.map((company) => ({
        client_id: clientId,
        name: company.name,
        industry: company.industry ?? null,
        website: company.website ?? null,
        phone: company.phone ?? null,
        email: company.email ?? null,
        address: company.address ?? null,
        notes: company.notes ?? null,
        custom_fields: company.custom_fields ?? {},
      }));

      const { data, error } = await supabase
        .from("companies")
        .insert(rows)
        .select();

      if (error) {
        return { success: false as const, error: error.message };
      }

      const created = data ?? [];

      return {
        success: true as const,
        companies: created,
        count: created.length,
      };
    },
  });

  return {
    search_companies,
    create_company,
    update_company,
    batch_create_companies,
  };
}
