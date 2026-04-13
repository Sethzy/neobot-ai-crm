/**
 * Contract tests for the agent-files upload limits migration.
 * @module supabase/migrations/__tests__/agent-files-upload-limits
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260413100000_lock_down_agent_files_bucket_upload_limits.sql",
);

describe("agent-files upload limits migration", () => {
  it("updates the existing agent-files bucket instead of creating a new bucket", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("UPDATE storage.buckets");
    expect(migrationSql).toContain("WHERE id = 'agent-files'");
    expect(migrationSql).toContain("file_size_limit = 10485760");
  });

  it("allows the shipped upload MIME types plus agent plain-text writes", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("'image/jpeg'");
    expect(migrationSql).toContain("'application/pdf'");
    expect(migrationSql).toContain("'text/csv'");
    expect(migrationSql).toContain("'text/plain'");
    expect(migrationSql).toContain("'text/plain; charset=utf-8'");
    expect(migrationSql).toContain("'application/json'");
  });
});
