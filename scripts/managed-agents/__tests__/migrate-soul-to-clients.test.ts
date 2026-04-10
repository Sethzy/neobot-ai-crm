/**
 * Tests for the one-time SOUL.md/USER.md -> clients columns data migration.
 * @module scripts/managed-agents/__tests__/migrate-soul-to-clients
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { migrateSoulToClients } from "../migrate-soul-to-clients";

type ClientRow = {
  client_id: string;
  client_profile: string | null;
  user_preferences: string | null;
};

interface StorageFixture {
  files: Record<string, string>;
  errors?: Record<string, unknown>;
}

function createMockSupabase(clients: ClientRow[], storage: StorageFixture) {
  const updated: Array<{ client_id: string; patch: Partial<ClientRow> }> = [];

  const download = vi.fn(async (path: string) => {
    const errorOverride = storage.errors?.[path];
    if (errorOverride !== undefined) {
      return { data: null, error: errorOverride };
    }

    const content = storage.files[path];

    if (content === undefined) {
      return { data: null, error: { message: "Object not found", status: 404 } };
    }

    return {
      data: { text: async () => content },
      error: null,
    };
  });

  const from = vi.fn((table: string) => {
    if (table !== "clients") {
      throw new Error(`unexpected table ${table}`);
    }

    return {
      select: () => ({
        then: (resolve: (result: { data: ClientRow[]; error: null }) => void) =>
          resolve({ data: clients, error: null }),
      }),
      update: (patch: Partial<ClientRow>) => ({
        eq: (_column: string, id: string) => ({
          // Mirrors the production call chain `.update(...).eq(...).is(...)`.
          // The mock applies the `IS NULL` guard against the current row
          // state so tests also exercise the race-safe short-circuit.
          is: (guardColumn: string, guardValue: null) => {
            const row = clients.find((client) => client.client_id === id);
            if (
              row &&
              row[guardColumn as keyof ClientRow] === guardValue
            ) {
              updated.push({ client_id: id, patch });
              Object.assign(row, patch);
            }
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };
  });

  const storageFrom = vi.fn(() => ({ download }));

  const client = {
    from,
    storage: { from: storageFrom },
  } as unknown as Parameters<typeof migrateSoulToClients>[0];

  return { client, download, updated };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("migrateSoulToClients", () => {
  it("copies SOUL.md -> client_profile and USER.md -> user_preferences", async () => {
    const mock = createMockSupabase(
      [{ client_id: "client-a", client_profile: null, user_preferences: null }],
      {
        files: {
          "client-a/SOUL.md": "I am Sunder.",
          "client-a/USER.md": "I am Alice.",
        },
      },
    );

    await migrateSoulToClients(mock.client);

    expect(mock.updated).toEqual([
      { client_id: "client-a", patch: { client_profile: "I am Sunder." } },
      { client_id: "client-a", patch: { user_preferences: "I am Alice." } },
    ]);
  });

  it("skips clients whose files are missing (no error, no write)", async () => {
    const mock = createMockSupabase(
      [{ client_id: "client-b", client_profile: null, user_preferences: null }],
      { files: {} },
    );

    await migrateSoulToClients(mock.client);

    expect(mock.updated).toEqual([]);
  });

  it("treats storage unknown errors that wrap a 404 response as missing files", async () => {
    const mock = createMockSupabase(
      [{ client_id: "client-e", client_profile: null, user_preferences: null }],
      {
        files: {},
        errors: {
          "client-e/SOUL.md": {
            name: "StorageUnknownError",
            message: "{}",
            originalError: new Response(
              JSON.stringify({
                error: "not_found",
                message: "Object not found",
                statusCode: "404",
              }),
              {
                status: 400,
                headers: { "content-type": "application/json" },
              },
            ),
          },
        },
      },
    );

    await migrateSoulToClients(mock.client);

    expect(mock.updated).toEqual([]);
  });

  it("only reads SOUL.md but not USER.md when only one file is present", async () => {
    const mock = createMockSupabase(
      [{ client_id: "client-c", client_profile: null, user_preferences: null }],
      { files: { "client-c/SOUL.md": "Soul only." } },
    );

    await migrateSoulToClients(mock.client);

    expect(mock.updated).toEqual([
      { client_id: "client-c", patch: { client_profile: "Soul only." } },
    ]);
  });

  it("is idempotent: running twice writes only once when the column is already populated", async () => {
    const mock = createMockSupabase(
      [{ client_id: "client-d", client_profile: null, user_preferences: null }],
      {
        files: {
          "client-d/SOUL.md": "I am Sunder.",
          "client-d/USER.md": "I am Alice.",
        },
      },
    );

    await migrateSoulToClients(mock.client);
    const firstPassWrites = mock.updated.length;
    await migrateSoulToClients(mock.client);

    expect(firstPassWrites).toBe(2);
    expect(mock.updated.length).toBe(firstPassWrites);
  });
});
