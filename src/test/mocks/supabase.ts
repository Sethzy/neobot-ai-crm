/**
 * Reusable Supabase query-builder mock for unit tests.
 * @module test/mocks/supabase
 */

export interface MockSupabaseError {
  message: string;
  code?: string;
}

export interface MockSupabaseResult<TData = unknown> {
  data: TData;
  error: MockSupabaseError | null;
}

export interface MockSupabaseConfig {
  selectResult?: MockSupabaseResult;
  insertResult?: MockSupabaseResult;
  updateResult?: MockSupabaseResult;
  deleteResult?: MockSupabaseResult;
}

type Operation = "select" | "insert" | "update" | "delete";

interface ChainableQuery {
  select: (...args: unknown[]) => ChainableQuery;
  insert: (...args: unknown[]) => ChainableQuery;
  update: (...args: unknown[]) => ChainableQuery;
  delete: (...args: unknown[]) => ChainableQuery;
  eq: (...args: unknown[]) => ChainableQuery;
  neq: (...args: unknown[]) => ChainableQuery;
  gt: (...args: unknown[]) => ChainableQuery;
  gte: (...args: unknown[]) => ChainableQuery;
  lt: (...args: unknown[]) => ChainableQuery;
  lte: (...args: unknown[]) => ChainableQuery;
  in: (...args: unknown[]) => ChainableQuery;
  is: (...args: unknown[]) => ChainableQuery;
  order: (...args: unknown[]) => ChainableQuery;
  limit: (...args: unknown[]) => ChainableQuery;
  range: (...args: unknown[]) => ChainableQuery;
  single: () => Promise<MockSupabaseResult>;
  maybeSingle: () => Promise<MockSupabaseResult>;
  then: <TResult1 = MockSupabaseResult>(
    onfulfilled?: ((value: MockSupabaseResult) => TResult1 | PromiseLike<TResult1>) | null,
  ) => Promise<TResult1>;
}

export interface MockSupabaseClient {
  from: (table: string) => ChainableQuery;
  calls: {
    from: string[];
    methods: Array<{ method: string; args: unknown[] }>;
  };
}

function defaultResult(): MockSupabaseResult<unknown[]> {
  return { data: [], error: null };
}

function pickResult(config: MockSupabaseConfig, operation: Operation): MockSupabaseResult {
  if (operation === "insert") {
    return config.insertResult ?? defaultResult();
  }

  if (operation === "update") {
    return config.updateResult ?? defaultResult();
  }

  if (operation === "delete") {
    return config.deleteResult ?? defaultResult();
  }

  return config.selectResult ?? defaultResult();
}

export function createMockSupabaseClient(config: MockSupabaseConfig = {}): MockSupabaseClient {
  const calls = {
    from: [] as string[],
    methods: [] as Array<{ method: string; args: unknown[] }>,
  };

  return {
    calls,
    from: (table: string) => {
      calls.from.push(table);
      let operation: Operation = "select";

      const query: ChainableQuery = {
        select: (...args: unknown[]) => {
          calls.methods.push({ method: "select", args });
          operation = operation === "insert" || operation === "update" || operation === "delete"
            ? operation
            : "select";
          return query;
        },
        insert: (...args: unknown[]) => {
          calls.methods.push({ method: "insert", args });
          operation = "insert";
          return query;
        },
        update: (...args: unknown[]) => {
          calls.methods.push({ method: "update", args });
          operation = "update";
          return query;
        },
        delete: (...args: unknown[]) => {
          calls.methods.push({ method: "delete", args });
          operation = "delete";
          return query;
        },
        eq: (...args: unknown[]) => {
          calls.methods.push({ method: "eq", args });
          return query;
        },
        neq: (...args: unknown[]) => {
          calls.methods.push({ method: "neq", args });
          return query;
        },
        gt: (...args: unknown[]) => {
          calls.methods.push({ method: "gt", args });
          return query;
        },
        gte: (...args: unknown[]) => {
          calls.methods.push({ method: "gte", args });
          return query;
        },
        lt: (...args: unknown[]) => {
          calls.methods.push({ method: "lt", args });
          return query;
        },
        lte: (...args: unknown[]) => {
          calls.methods.push({ method: "lte", args });
          return query;
        },
        in: (...args: unknown[]) => {
          calls.methods.push({ method: "in", args });
          return query;
        },
        is: (...args: unknown[]) => {
          calls.methods.push({ method: "is", args });
          return query;
        },
        order: (...args: unknown[]) => {
          calls.methods.push({ method: "order", args });
          return query;
        },
        limit: (...args: unknown[]) => {
          calls.methods.push({ method: "limit", args });
          return query;
        },
        range: (...args: unknown[]) => {
          calls.methods.push({ method: "range", args });
          return query;
        },
        single: async () => {
          calls.methods.push({ method: "single", args: [] });
          const result = pickResult(config, operation);
          return {
            data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
            error: result.error,
          };
        },
        maybeSingle: async () => {
          calls.methods.push({ method: "maybeSingle", args: [] });
          const result = pickResult(config, operation);
          return {
            data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
            error: result.error,
          };
        },
        then: async (onfulfilled) => {
          const result = pickResult(config, operation);
          if (!onfulfilled) {
            return result as never;
          }
          return onfulfilled(result);
        },
      };

      return query;
    },
  };
}
