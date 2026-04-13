/**
 * Managed-agents custom tool: unified CRM search.
 *
 * Supports an optional `include` parameter that batch-fetches related entities
 * in parallel and nests them under underscore-prefixed keys (_contacts, _deals,
 * _interactions, _notes, _tasks) on each primary record. This lets the agent
 * hydrate full deal/contact context in a single tool call instead of 3-4.
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

// ---------------------------------------------------------------------------
// Include configuration
// ---------------------------------------------------------------------------

const INCLUDABLE_ENTITIES = ["contacts", "deals", "interactions", "notes", "tasks"] as const;
type IncludableEntity = (typeof INCLUDABLE_ENTITIES)[number];

interface IncludeSpec {
  /** Supabase table to query. */
  table: string;
  /** Column on the related table that matches the primary record's ID. */
  joinColumn: string;
  /** Primary key column on the parent record used as the join value. */
  parentKey: string;
  /** Columns to select. "*" for all. */
  select: string;
  /** Default max rows per parent record. */
  defaultLimit: number;
  /** Sort order for included records. */
  orderBy?: { column: string; ascending: boolean };
}

/**
 * Junction-table include — used for contacts↔deals via the deal_contacts table.
 * Requires a two-step fetch: junction rows, then the target entity.
 */
interface JunctionIncludeSpec {
  junction: true;
  /** Junction table name. */
  table: string;
  /** Column on the junction table that matches the parent record's ID. */
  joinColumn: string;
  /** Primary key column on the parent record. */
  parentKey: string;
  /** Column on the junction table that points to the target entity. */
  targetColumn: string;
  /** Supabase select string with FK-disambiguated embed. */
  select: string;
  defaultLimit: number;
  orderBy?: { column: string; ascending: boolean };
}

type IncludeSpecEntry = IncludeSpec | JunctionIncludeSpec;

/** Maps each searchable entity to its allowed includes and how to fetch them. */
const INCLUDE_MAP: Partial<Record<SearchEntity, Partial<Record<IncludableEntity, IncludeSpecEntry>>>> = {
  deals: {
    contacts: {
      junction: true,
      table: "deal_contacts",
      joinColumn: "deal_id",
      parentKey: "deal_id",
      targetColumn: "contact_id",
      select: "*, contacts!deal_contacts_contact_id_fkey(first_name, last_name, email, phone, type)",
      defaultLimit: 20,
      orderBy: { column: "is_primary", ascending: false },
    },
    interactions: {
      table: "interactions",
      joinColumn: "deal_id",
      parentKey: "deal_id",
      select: "interaction_id, contact_id, type, summary, occurred_at",
      defaultLimit: 10,
      orderBy: { column: "occurred_at", ascending: false },
    },
    notes: {
      table: "record_notes",
      joinColumn: "record_id",
      parentKey: "deal_id",
      select: "id, body, created_at",
      defaultLimit: 5,
      orderBy: { column: "created_at", ascending: false },
    },
    tasks: {
      table: "crm_tasks",
      joinColumn: "deal_id",
      parentKey: "deal_id",
      select: "task_id, title, description, status, due_date",
      defaultLimit: 10,
      orderBy: { column: "due_date", ascending: true },
    },
  },
  contacts: {
    deals: {
      junction: true,
      table: "deal_contacts",
      joinColumn: "contact_id",
      parentKey: "contact_id",
      targetColumn: "deal_id",
      select: "*, deals!deal_contacts_deal_id_fkey(deal_id, address, stage, amount)",
      defaultLimit: 10,
      orderBy: { column: "is_primary", ascending: false },
    },
    interactions: {
      table: "interactions",
      joinColumn: "contact_id",
      parentKey: "contact_id",
      select: "interaction_id, deal_id, type, summary, occurred_at",
      defaultLimit: 10,
      orderBy: { column: "occurred_at", ascending: false },
    },
    notes: {
      table: "record_notes",
      joinColumn: "record_id",
      parentKey: "contact_id",
      select: "id, body, created_at",
      defaultLimit: 5,
      orderBy: { column: "created_at", ascending: false },
    },
    tasks: {
      table: "crm_tasks",
      joinColumn: "contact_id",
      parentKey: "contact_id",
      select: "task_id, title, description, status, due_date",
      defaultLimit: 10,
      orderBy: { column: "due_date", ascending: true },
    },
  },
  companies: {
    contacts: {
      table: "contacts",
      joinColumn: "company_id",
      parentKey: "company_id",
      select: "contact_id, first_name, last_name, email, phone, type",
      defaultLimit: 20,
    },
    deals: {
      table: "deals",
      joinColumn: "company_id",
      parentKey: "company_id",
      select: "deal_id, address, stage, amount",
      defaultLimit: 10,
    },
  },
};

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
  include: z
    .array(z.enum(INCLUDABLE_ENTITIES))
    .optional()
    .describe(
      "Related entities to fetch alongside primary results, nested under _contacts, _deals, _interactions, _notes, _tasks. " +
        "Avoids multiple sequential calls. " +
        "Valid includes — deals: [contacts, interactions, notes, tasks]. " +
        "contacts: [deals, interactions, notes, tasks]. " +
        "companies: [contacts, deals]. " +
        "Other entities do not support include.",
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

// ---------------------------------------------------------------------------
// Batch-fetch included entities
// ---------------------------------------------------------------------------

/**
 * Fetches related entities for an array of primary records and attaches them
 * under underscore-prefixed keys (e.g. `_contacts`, `_interactions`).
 * All include queries run in parallel via Promise.all.
 */
async function fetchIncludes(
  context: ToolContext,
  entity: SearchEntity,
  records: Record<string, unknown>[],
  includes: IncludableEntity[],
): Promise<Record<string, unknown>[]> {
  const entityIncludes = INCLUDE_MAP[entity];
  if (!entityIncludes || records.length === 0) return records;

  // Validate requested includes
  const invalid = includes.filter((inc) => !entityIncludes[inc]);
  if (invalid.length > 0) {
    // Shouldn't happen — Zod validates the enum — but guard defensively.
    throw new Error(
      `Invalid include(s) [${invalid.join(", ")}] for entity "${entity}". ` +
        `Valid: [${Object.keys(entityIncludes).join(", ")}].`,
    );
  }

  // Collect parent IDs per include spec
  const fetchPromises = includes.map(async (includeName) => {
    const spec = entityIncludes[includeName]!;
    const parentIds = records
      .map((r) => r[spec.parentKey] as string)
      .filter(Boolean);
    const uniqueIds = [...new Set(parentIds)];

    if (uniqueIds.length === 0) return { includeName, grouped: new Map<string, unknown[]>() };

    // For record_notes, we also need to filter by record_type
    const isNotes = includeName === "notes";
    const noteRecordType =
      isNotes && entity === "deals"
        ? "deal"
        : isNotes && entity === "contacts"
          ? "contact"
          : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let qb = (context.supabase as any)
      .from(spec.table)
      .select(spec.select)
      .eq("client_id", context.clientId)
      .in(spec.joinColumn, uniqueIds);

    if (noteRecordType) {
      qb = qb.eq("record_type", noteRecordType);
    }

    if (spec.orderBy) {
      qb = qb.order(spec.orderBy.column, { ascending: spec.orderBy.ascending });
    }

    // Fetch up to defaultLimit * number of parents — we'll slice per-parent below.
    qb = qb.limit(spec.defaultLimit * uniqueIds.length);

    const { data, error } = await qb;
    if (error) {
      console.warn(`search_crm include "${includeName}" failed: ${error.message}`);
      return { includeName, grouped: new Map<string, unknown[]>() };
    }

    // Group results by join column
    const grouped = new Map<string, unknown[]>();
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const key = String(row[spec.joinColumn]);
      if (!grouped.has(key)) grouped.set(key, []);
      const bucket = grouped.get(key)!;
      if (bucket.length < spec.defaultLimit) {
        bucket.push(row);
      }
    }

    return { includeName, grouped };
  });

  const results = await Promise.all(fetchPromises);

  // Attach included data to each primary record
  for (const record of records) {
    for (const { includeName, grouped } of results) {
      const spec = entityIncludes[includeName]!;
      const parentId = String(record[spec.parentKey]);
      const key = `_${includeName}`;
      record[key] = grouped.get(parentId) ?? [];
    }
  }

  return records;
}

export const searchCrmTool: ManagedAgentTool<SearchInput> = {
  name: "search_crm",
  description:
    "Default tool for reading CRM data. Search any entity (contacts, companies, deals, interactions, tasks, deal_contacts, record_notes) " +
    "with free-text query and key-value filters. Returns matching records sorted by relevance. " +
    "Use `include` to fetch related entities in one call instead of multiple sequential calls. " +
    "Valid includes — deals: [contacts, interactions, notes, tasks]; contacts: [deals, interactions, notes, tasks]; companies: [contacts, deals]. " +
    "Example: search_crm({ entity: 'deals', filters: { deal_id: '...' }, include: ['contacts', 'interactions', 'notes'] }). " +
    "For relationships without include: use entity 'deal_contacts' with a deal_id or contact_id filter. " +
    "For notes: use entity 'record_notes' with record_type and record_id filters. " +
    "Use this before creating records to check for duplicates. " +
    "For aggregations (COUNT, SUM, AVG) or complex filters, escalate to run_sql.",
  inputSchema,
  execute: async ({ entity, query, filters, include, limit }, context) => {
    const maxResults = limit ?? DEFAULT_CRM_RESULT_LIMIT;
    const filterEntries = filters ? Object.entries(filters) : [];

    // Validate include is supported for this entity
    if (include && include.length > 0) {
      const entityIncludes = INCLUDE_MAP[entity];
      if (!entityIncludes) {
        return {
          success: false as const,
          error: `Entity "${entity}" does not support include. Valid entities for include: deals, contacts, companies.`,
        };
      }
      const invalid = include.filter((inc) => !entityIncludes[inc]);
      if (invalid.length > 0) {
        return {
          success: false as const,
          error: `Invalid include(s) [${invalid.join(", ")}] for entity "${entity}". Valid: [${Object.keys(entityIncludes).join(", ")}].`,
        };
      }
    }

    if (entity === "deal_contacts") {
      return searchDealContacts(context, filterEntries, maxResults);
    }

    const config = ENTITY_CONFIG[entity];

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

    let records = (data ?? []) as Record<string, unknown>[];

    // Fetch included entities if requested
    if (include && include.length > 0) {
      records = await fetchIncludes(context, entity, records, include);
    }

    return { success: true as const, records, count: records.length };
  },
};
