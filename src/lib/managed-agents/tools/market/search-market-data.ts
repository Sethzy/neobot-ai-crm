/**
 * search_market_data tool for managed agents.
 *
 * @module lib/managed-agents/tools/market/search-market-data
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { buildIlikePattern } from "@/lib/crm/postgrest-filters";
import { extractDistrictNumber, median, toNumber } from "@/lib/property/utils";
import { createPropertyPublicServerClient } from "@/lib/supabase/property-public-server";

import type { ManagedAgentTool } from "../types";

const DATASETS = ["agents", "transactions", "hdb", "ura"] as const;
type Dataset = (typeof DATASETS)[number];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const STATS_SAMPLE_LIMIT = 10_000;
const SQFT_PER_SQM = 10.764;

type StatsRange = { min: number; max: number } | null;
type HdbStatsRow = { resale_price: number | string | null; floor_area_sqm: number | string | null };
type UraStatsRow = { price: number | string | null; price_psf: number | string | null };

const DATASET_CONFIG: Record<
  Dataset,
  {
    table: string;
    dateColumn: string | null;
    orderBy: { column: string; ascending: boolean };
    hasTown: boolean;
    hasDistrict: boolean;
  }
> = {
  agents: {
    table: "cea_agents",
    dateColumn: null,
    orderBy: { column: "salesperson_name", ascending: true },
    hasTown: false,
    hasDistrict: false,
  },
  transactions: {
    table: "cea_transactions",
    dateColumn: "transaction_date",
    orderBy: { column: "transaction_date", ascending: false },
    hasTown: true,
    hasDistrict: true,
  },
  hdb: {
    table: "hdb_resale_transactions",
    dateColumn: "month",
    orderBy: { column: "month", ascending: false },
    hasTown: true,
    hasDistrict: false,
  },
  ura: {
    table: "ura_transactions",
    dateColumn: "contract_date",
    orderBy: { column: "contract_date", ascending: false },
    hasTown: false,
    hasDistrict: true,
  },
};

const inputSchema = z.object({
  dataset: z
    .enum(DATASETS)
    .describe(
      "Which dataset to query. agents = CEA agent registry. transactions = CEA residential transaction records. hdb = HDB resale transactions. ura = URA private residential sales.",
    ),
  mode: z
    .enum(["search", "stats"])
    .default("search")
    .describe(
      "search = return individual records. stats = return aggregate statistics. For hdb and ura, large stats queries may use the most recent 10,000 matching rows ordered by date; totalMatching remains exact.",
    ),
  town: z.string().optional().describe("Town name filter (exact match, normalized to uppercase)."),
  district: z.string().optional().describe("District filter. Accepts values like 01, 9, or District 15."),
  date_from: z.string().regex(ISO_DATE_REGEX, "Must be YYYY-MM-DD").optional().describe("Start date in YYYY-MM-DD format."),
  date_to: z.string().regex(ISO_DATE_REGEX, "Must be YYYY-MM-DD").optional().describe("End date in YYYY-MM-DD format."),
  agent_reg_no: z.string().optional().describe("CEA registration number (exact match, normalized to uppercase)."),
  agent_name: z.string().optional().describe("Agent name partial match for the agents dataset."),
  agency_name: z.string().optional().describe("Agency name partial match for the agents dataset."),
  property_type: z.string().optional().describe("Property type exact match for transactions and ura."),
  flat_type: z.string().optional().describe("HDB flat type exact match."),
  street: z.string().optional().describe("Street name partial match for hdb and ura."),
  project: z.string().optional().describe("Project name partial match for ura."),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Maximum number of search results. Defaults to ${DEFAULT_LIMIT}.`),
});

type SearchMarketDataInput = z.infer<typeof inputSchema>;
type MarketDataFilters = Pick<
  SearchMarketDataInput,
  | "town"
  | "district"
  | "date_from"
  | "date_to"
  | "agent_reg_no"
  | "agent_name"
  | "agency_name"
  | "property_type"
  | "flat_type"
  | "street"
  | "project"
>;

function normalizeDistrict(input: string): string | null {
  const districtNumber = extractDistrictNumber(input);

  if (districtNumber === null) {
    return null;
  }

  return districtNumber.toString().padStart(2, "0");
}

function normalizeAgentRegNo(input: string): string {
  return input.trim().toUpperCase();
}

function isIsoCalendarDate(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(queryBuilder: any, dataset: Dataset, params: MarketDataFilters) {
  const config = DATASET_CONFIG[dataset];

  if (params.town && config.hasTown) {
    queryBuilder = queryBuilder.eq("town", params.town.toUpperCase());
  }

  if (params.district && config.hasDistrict) {
    const normalizedDistrict = normalizeDistrict(params.district);
    if (normalizedDistrict) {
      queryBuilder = queryBuilder.eq("district", normalizedDistrict);
    }
  }

  if (params.date_from && config.dateColumn) {
    queryBuilder = queryBuilder.gte(config.dateColumn, params.date_from);
  }

  if (params.date_to && config.dateColumn) {
    queryBuilder = queryBuilder.lte(config.dateColumn, params.date_to);
  }

  if (params.agent_reg_no) {
    const normalizedRegNo = normalizeAgentRegNo(params.agent_reg_no);

    if (dataset === "agents") {
      queryBuilder = queryBuilder.eq("registration_no", normalizedRegNo);
    } else if (dataset === "transactions") {
      queryBuilder = queryBuilder.eq("salesperson_reg_num", normalizedRegNo);
    }
  }

  if (params.agent_name && dataset === "agents") {
    queryBuilder = queryBuilder.ilike("salesperson_name", buildIlikePattern(params.agent_name));
  }

  if (params.agency_name && dataset === "agents") {
    queryBuilder = queryBuilder.ilike("estate_agent_name", buildIlikePattern(params.agency_name));
  }

  if (params.property_type && (dataset === "transactions" || dataset === "ura")) {
    queryBuilder = queryBuilder.eq("property_type", params.property_type);
  }

  if (params.flat_type && dataset === "hdb") {
    queryBuilder = queryBuilder.eq("flat_type", params.flat_type);
  }

  if (params.street) {
    if (dataset === "hdb") {
      queryBuilder = queryBuilder.ilike("street_name", buildIlikePattern(params.street));
    } else if (dataset === "ura") {
      queryBuilder = queryBuilder.ilike("street", buildIlikePattern(params.street));
    }
  }

  if (params.project && dataset === "ura") {
    queryBuilder = queryBuilder.ilike("project", buildIlikePattern(params.project));
  }

  return queryBuilder;
}

function buildQuery(
  supabase: SupabaseClient,
  dataset: Dataset,
  columns: string,
  filters: MarketDataFilters,
  selectOptions?: Record<string, unknown>,
) {
  // @tenant-neutral: property market datasets are global reference tables with no client_id column.
  let queryBuilder =
    selectOptions === undefined
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from(DATASET_CONFIG[dataset].table).select(columns)
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from(DATASET_CONFIG[dataset].table).select(columns, selectOptions);
  queryBuilder = applyFilters(queryBuilder, dataset, filters);
  return queryBuilder;
}

function getDateValidationError(
  dateFrom: SearchMarketDataInput["date_from"],
  dateTo: SearchMarketDataInput["date_to"],
): string | null {
  if (dateFrom && !isIsoCalendarDate(dateFrom)) {
    return "date_from must be a real calendar date in YYYY-MM-DD format";
  }

  if (dateTo && !isIsoCalendarDate(dateTo)) {
    return "date_to must be a real calendar date in YYYY-MM-DD format";
  }

  if (dateFrom && dateTo && dateFrom > dateTo) {
    return "date_from must be on or before date_to";
  }

  return null;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getRange(values: number[]): StatsRange {
  if (values.length === 0) {
    return null;
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function toHdbPsf(row: HdbStatsRow): number | null {
  const price = toNumber(row.resale_price);
  const sqm = toNumber(row.floor_area_sqm);

  if (price === null || sqm === null || sqm <= 0) {
    return null;
  }

  return Math.round(price / (sqm * SQFT_PER_SQM));
}

function getSamplingMetadata(dataset: "hdb" | "ura", totalMatching: number) {
  if (totalMatching <= STATS_SAMPLE_LIMIT) {
    return {};
  }

  const dateColumn = DATASET_CONFIG[dataset].dateColumn;

  return {
    sampled: true as const,
    sampleSize: STATS_SAMPLE_LIMIT,
    sampleBasis: "most_recent_matching_rows_by_date" as const,
    sampleDescription: `Aggregates are computed from the most recent ${STATS_SAMPLE_LIMIT} matching rows ordered by ${dateColumn} descending.`,
  };
}

async function getExactCount(
  supabase: SupabaseClient,
  dataset: Dataset,
  filters: MarketDataFilters,
) {
  const queryBuilder = buildQuery(supabase, dataset, "*", filters, {
    count: "exact",
    head: true,
  });
  const { error, count } = await queryBuilder;

  if (error) {
    return { success: false as const, error: error.message };
  }

  return { success: true as const, count: count ?? 0 };
}

async function getSampleRows(
  supabase: SupabaseClient,
  dataset: "hdb" | "ura",
  filters: MarketDataFilters,
) {
  const config = DATASET_CONFIG[dataset];
  const columns = dataset === "hdb" ? "resale_price, floor_area_sqm" : "price, price_psf";
  let queryBuilder = buildQuery(supabase, dataset, columns, filters);
  queryBuilder = queryBuilder.order(config.orderBy.column, {
    ascending: config.orderBy.ascending,
  });

  const { data, error } = await queryBuilder.limit(STATS_SAMPLE_LIMIT);

  if (error) {
    return { success: false as const, error: error.message };
  }

  return {
    success: true as const,
    rows: (data ?? []) as Array<HdbStatsRow | UraStatsRow>,
  };
}

async function executeCountOnlyStats(
  supabase: SupabaseClient,
  dataset: "agents" | "transactions",
  filters: MarketDataFilters,
) {
  const countResult = await getExactCount(supabase, dataset, filters);

  if (!countResult.success) {
    return countResult;
  }

  const totalMatching = countResult.count;

  return {
    success: true as const,
    dataset,
    stats: dataset === "agents" ? { totalAgents: totalMatching } : { totalTransactions: totalMatching },
    totalMatching,
  };
}

async function executeHdbStats(supabase: SupabaseClient, filters: MarketDataFilters) {
  const [sampleResult, countResult] = await Promise.all([
    getSampleRows(supabase, "hdb", filters),
    getExactCount(supabase, "hdb", filters),
  ]);

  if (!countResult.success) {
    return countResult;
  }

  if (!sampleResult.success) {
    return sampleResult;
  }

  const totalMatching = countResult.count;
  const rows = sampleResult.rows as HdbStatsRow[];
  const prices = rows
    .map((row) => toNumber(row.resale_price))
    .filter((value): value is number => value !== null);
  const psfValues = rows.map(toHdbPsf).filter((value): value is number => value !== null);
  const avgPsf = average(psfValues);

  return {
    success: true as const,
    dataset: "hdb" as const,
    stats: {
      totalTransactions: totalMatching,
      medianPrice: median(prices),
      avgPrice: average(prices),
      priceRange: getRange(prices),
      avgPsf: avgPsf === null ? null : Math.round(avgPsf),
      medianPsf: median(psfValues),
    },
    totalMatching,
    ...getSamplingMetadata("hdb", totalMatching),
  };
}

async function executeUraStats(supabase: SupabaseClient, filters: MarketDataFilters) {
  const [sampleResult, countResult] = await Promise.all([
    getSampleRows(supabase, "ura", filters),
    getExactCount(supabase, "ura", filters),
  ]);

  if (!countResult.success) {
    return countResult;
  }

  if (!sampleResult.success) {
    return sampleResult;
  }

  const totalMatching = countResult.count;
  const rows = sampleResult.rows as UraStatsRow[];
  const prices = rows
    .map((row) => toNumber(row.price))
    .filter((value): value is number => value !== null);
  const psfValues = rows
    .map((row) => toNumber(row.price_psf))
    .filter((value): value is number => value !== null);

  return {
    success: true as const,
    dataset: "ura" as const,
    stats: {
      totalTransactions: totalMatching,
      medianPrice: median(prices),
      avgPrice: average(prices),
      priceRange: getRange(prices),
      avgPsf: average(psfValues),
      medianPsf: median(psfValues),
    },
    totalMatching,
    ...getSamplingMetadata("ura", totalMatching),
  };
}

export const searchMarketDataTool: ManagedAgentTool<SearchMarketDataInput> = {
  name: "search_market_data",
  description:
    "Search Singapore property market data across CEA agents, CEA transactions, HDB resale transactions, and URA private sales. Use search mode for records and stats mode for aggregates. " +
    "LOCATION FILTERING: pass `town` (e.g. \"TAMPINES\", \"YISHUN\") to scope hdb and CEA transactions to a specific HDB town — values are normalised to uppercase before query, but you may pass mixed case. Pass `district` (e.g. \"15\", \"D9\") to scope URA and CEA transactions to a planning district. Without these filters the dataset returns all rows ordered by date, which may surface a single town and look like a default. " +
    "OTHER FILTERS: `flat_type` (HDB only, exact match), `street`/`project` (partial match), `date_from`/`date_to` (YYYY-MM-DD), `agent_reg_no`/`agent_name`/`agency_name` (CEA only). " +
    "Large HDB and URA stats queries may return recent-window sample metadata alongside exact totalMatching counts.",
  inputSchema,
  execute: async ({
    dataset,
    mode,
    town,
    district,
    date_from,
    date_to,
    agent_reg_no,
    agent_name,
    agency_name,
    property_type,
    flat_type,
    street,
    project,
    limit,
  }) => {
    let propertySupabase: SupabaseClient;

    try {
      propertySupabase = createPropertyPublicServerClient();
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : "Property data is not configured.",
      };
    }

    const filters = {
      town,
      district,
      date_from,
      date_to,
      agent_reg_no,
      agent_name,
      agency_name,
      property_type,
      flat_type,
      street,
      project,
    } satisfies MarketDataFilters;
    const dateValidationError = getDateValidationError(date_from, date_to);

    if (dateValidationError) {
      return { success: false as const, error: dateValidationError };
    }

    if (mode === "stats") {
      if (dataset === "agents" || dataset === "transactions") {
        return executeCountOnlyStats(propertySupabase, dataset, filters);
      }

      if (dataset === "hdb") {
        return executeHdbStats(propertySupabase, filters);
      }

      return executeUraStats(propertySupabase, filters);
    }

    const config = DATASET_CONFIG[dataset];
    let queryBuilder = buildQuery(propertySupabase, dataset, "*", filters);
    queryBuilder = queryBuilder.order(config.orderBy.column, {
      ascending: config.orderBy.ascending,
    });

    const resolvedLimit = limit ?? DEFAULT_LIMIT;
    const { data, error } = await queryBuilder.limit(resolvedLimit);

    if (error) {
      return { success: false as const, error: error.message };
    }

    const results = data ?? [];
    return {
      success: true as const,
      dataset,
      results,
      count: results.length,
    };
  },
};
