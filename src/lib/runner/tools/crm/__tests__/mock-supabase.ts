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
 * Creates a mock Supabase client with per-table query results.
 *
 * Any unconfigured table defaults to `{ data: [], error: null }`.
 */
export function createMockSupabase(tableResults: Record<string, QueryResult> = {}) {
  const builders: Record<string, ChainableBuilder> = {};

  const from = vi.fn((table: string) => {
    if (!builders[table]) {
      const result = tableResults[table] ?? { data: [], error: null };
      builders[table] = createChainableBuilder(result);
    }

    return builders[table];
  });

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    from,
    builders,
  };
}
