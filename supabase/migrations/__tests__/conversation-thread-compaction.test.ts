/**
 * Contract tests for the PR22 conversation thread compaction migration.
 * @module supabase/migrations/__tests__/conversation-thread-compaction
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260306020000_add_conversation_thread_compaction.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("20260306020000_add_conversation_thread_compaction.sql", () => {
  it("preserves explicit updated_at writes while still ignoring compaction-only updates", () => {
    expect(migrationSql).toContain("IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN");
    expect(migrationSql).toContain("NEW.updated_at = now();");
    expect(migrationSql).toContain("NEW.updated_at = OLD.updated_at;");
  });
});
