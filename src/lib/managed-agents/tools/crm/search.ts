/**
 * Managed-agents custom tool: unified CRM search.
 * Ported from the legacy runner with the same query logic and result shape.
 *
 * @module lib/managed-agents/tools/crm/search
 */
import { z } from "zod";

import {
  buildIlikePattern,
  buildSearchExpression,
  DEFAULT_CRM_RESULT_LIMIT,
  normalizeDateString,
  normalizeDateUpperBound,
} from "@/lib/crm/filter-utils";

import type { ManagedAgentTool, ToolContext } from "../types";

const SEARCH_ENTITIES = [
  "contacts",
  "companies",
  "deals",
  "interactions",
  "tasks",
  "deal_contacts",
  "record_notes",
] as const;

type SearchEntity = (typeof SEARCH_ENTITIES)[number];

const ENTITY_CONFIG: Record<
  Exclude<SearchEntity, "deal_contacts">,
  {
    table: string;
    searchColumns: string[];
    orderBy?: { column: string; ascending: boolean };
  }
> = {
  contacts: {
    table: "contacts",
    searchColumns: ["first_name", "last_name", "email", "phone"],
  },
  companies: {
    table: "companies",
    searchColumns: ["name", "website", "phone", "email", "address"],
  },
  deals: {
    table: "deals",
    searchColumns: ["address"],
  },
  interactions: {
    table: "interactions",
    searchColumns: ["summary"],
    orderBy: { column: "occurred_at", ascending: false },
  },
  tasks: {
    table: "crm_tasks",
    searchColumns: ["title", "description"],
    orderBy: { column: "due_date", ascending: true },
  },
  record_notes: {
    table: "record_notes",
    searchColumns: ["body"],
    orderBy: { column: "created_at", ascending: false },
  },
};

const DATE_RANGE_FILTERS: Record<
  string,
  { column: string; op: "gte" | "lte"; normalizer: typeof normalizeDateString }
> = {
  occurred_after: { column: "occurred_at", op: "gte", normalizer: normalizeDateString },
  occurred_before: { column: "occurred_at", op: "lte", normalizer: normalizeDateUpperBound },
};

const inputSchema = z.object({
  entity: z.enum(SEARCH_ENTITIES).describe("CRM entity type to search."),
  query: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Free-text search term. Searches name/address/title/summary fields depending on entity.",
    ),
  filters: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .optional()
    .describe(
      "Key-value filters applied as equality matches. Common filters: " +
        "{ stage: '...', type: '...', status: '...', company_id: '...', contact_id: '...', deal_id: '...' }. " +
        "For date ranges on interactions: use occurred_after / occurred_before.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum results. Defaults to 20."),
});

type SearchInput = z.infer<typeof inputSchema>;

async function searchDealContacts(
  context: ToolContext,
  filterEntries: [string, string | number | boolean | null][],
  maxResults: number,
) {
  const filtersMap = Object.fromEntries(filterEntries);
  const dealId = filtersMap.deal_id;
  const contactId = filtersMap.contact_id;

  if (!dealId && !contactId) {
    return {
      success: false as const,
      error: "deal_contacts requires a deal_id or contact_id filter.",
    };
  }

  if (dealId) {
    const { data, error } = await context.supabase
      .from("deal_contacts")
      .select("*, contacts!deal_contacts_contact_id_fkey(first_name, last_name, email, phone)")
      .eq("client_id", context.clientId)
      .eq("deal_id", String(dealId))
      .limit(maxResults);

    if (error) {
      return { success: false as const, error: error.message };
    }

    const records = data ?? [];
    return { success: true as const, records, count: records.length };
  }

  const { data, error } = await context.supabase
    .from("deal_contacts")
    .select("*, deals!deal_contacts_deal_id_fkey(deal_id, address, stage, amount)")
    .eq("client_id", context.clientId)
    .eq("contact_id", String(contactId))
    .order("is_primary", { ascending: false })
    .limit(maxResults);

  if (error) {
    return { success: false as const, error: error.message };
  }

  const records = data ?? [];
  return { success: true as const, records, count: records.length };
}

export const searchCrmTool: ManagedAgentTool<SearchInput> = {
  name: "search_crm",
  description:
    "Default tool for reading CRM data. Search any entity (contacts, companies, deals, interactions, tasks, deal_contacts, record_notes) " +
    "with free-text query and key-value filters. Returns matching records sorted by relevance. " +
    "For relationships: use entity 'deal_contacts' with a deal_id or contact_id filter, " +
    "or filter contacts/deals by company_id. " +
    "For notes: use entity 'record_notes' with record_type and record_id filters to read notes, or a free-text query to search note content. " +
    "Use this before creating records to check for duplicates. " +
    "For JOINs, aggregations, or complex filters, escalate to run_sql.",
  inputSchema,
  execute: async ({ entity, query, filters, limit }, context) => {
    const maxResults = limit ?? DEFAULT_CRM_RESULT_LIMIT;
    const filterEntries = filters ? Object.entries(filters) : [];

    if (entity === "deal_contacts") {
      return searchDealContacts(context, filterEntries, maxResults);
    }

    const config = ENTITY_CONFIG[entity];

    // The legacy runner uses the untyped query builder for flexible filter chains.
    // Preserve that shape in the port rather than refactoring the query layer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let queryBuilder = (context.supabase as any)
      .from(config.table)
      .select("*")
      .eq("client_id", context.clientId);

    if (query) {
      if (config.searchColumns.length === 1) {
        queryBuilder = queryBuilder.ilike(config.searchColumns[0], buildIlikePattern(query));
      } else {
        queryBuilder = queryBuilder.or(buildSearchExpression(query, config.searchColumns));
      }
    }

    for (const [key, value] of filterEntries) {
      if (value === null) {
        continue;
      }

      const dateRange = DATE_RANGE_FILTERS[key];
      if (dateRange) {
        const normalized = dateRange.normalizer(String(value));
        if (normalized) {
          queryBuilder = dateRange.op === "gte"
            ? queryBuilder.gte(dateRange.column, normalized)
            : queryBuilder.lte(dateRange.column, normalized);
        }
        continue;
      }

      queryBuilder = queryBuilder.eq(key, value);
    }

    if (config.orderBy) {
      queryBuilder = queryBuilder.order(config.orderBy.column, {
        ascending: config.orderBy.ascending,
      });
    }

    const { data, error } = await queryBuilder.limit(maxResults);

    if (error) {
      return { success: false as const, error: error.message };
    }

    const records = data ?? [];
    return { success: true as const, records, count: records.length };
  },
};
