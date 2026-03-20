/**
 * Test helper for mocking Supabase PostgREST query builder chains.
 * @module lib/runner/tools/crm/__tests__/mock-supabase
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";

import type { Database } from "@/types/database";

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

type ChainableBuilder = Record<string, ReturnType<typeof vi.fn>> & {
  then: (
    resolve: (value: QueryResult) => void,
    reject?: (reason: unknown) => void,
  ) => Promise<void>;
};

/** Query builder methods used by CRM tools that should return `this`. */
const CHAIN_METHOD_NAMES = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "or",
  "ilike",
  "like",
  "is",
  "in",
  "not",
  "limit",
  "order",
  "single",
  "maybeSingle",
  "range",
  "filter",
  "match",
  "gte",
  "lte",
  "gt",
  "lt",
] as const;

function createChainableBuilder(result: QueryResult): ChainableBuilder {
  const builder = {} as ChainableBuilder;

  for (const methodName of CHAIN_METHOD_NAMES) {
    builder[methodName] = vi.fn().mockReturnValue(builder);
  }

  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);

  return builder;
}

/**
 * Accepts a single result or an ordered array of results.
 * When an array is provided, each `from(table)` call gets the next result in sequence.
 */
type TableResultConfig = QueryResult | QueryResult[];

/**
 * Creates a mock Supabase client with per-table query results.
 *
 * Supports sequenced results: pass an array of `QueryResult` for a table and each
 * successive `from(table)` call will get the next result in order.
 * A single `QueryResult` works as before (every call returns the same result).
 *
 * Any unconfigured table defaults to `{ data: [], error: null }`.
 */
export function createMockSupabase(tableResults: Record<string, TableResultConfig> = {}) {
  /** One builder per `from()` call, in order. */
  const builderHistory: Record<string, ChainableBuilder[]> = {};
  /** Tracks how many times `from(table)` has been called per table. */
  const callCounts: Record<string, number> = {};

  const from = vi.fn((table: string) => {
    callCounts[table] = (callCounts[table] ?? 0) + 1;
    const callIndex = callCounts[table] - 1;

    const config = tableResults[table];
    let result: QueryResult;

    if (Array.isArray(config)) {
      result = config[callIndex] ?? config[config.length - 1];
    } else {
      result = config ?? { data: [], error: null };
    }

    const builder = createChainableBuilder(result);

    if (!builderHistory[table]) {
      builderHistory[table] = [];
    }
    builderHistory[table].push(builder);

    return builder;
  });

  /** Proxy that lazily returns the first builder for each table (backward-compatible). */
  const builders = new Proxy({} as Record<string, ChainableBuilder>, {
    get(_, table: string) {
      return builderHistory[table]?.[0];
    },
  });

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    from,
    /** Legacy accessor — returns the first builder for each table via lazy proxy. */
    builders,
    /** All builders per table, in call order. Use for sequenced-result assertions. */
    builderHistory,
  };
}
