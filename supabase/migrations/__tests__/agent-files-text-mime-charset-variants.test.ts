/**
 * Contract tests for PR-F's text MIME charset variant migration.
 * @module supabase/migrations/__tests__/agent-files-text-mime-charset-variants
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260425231127_allow_agent_file_text_mime_charset_variants.sql",
);

describe("agent-files text MIME charset variants migration", () => {
  it("updates the existing agent-files bucket", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("UPDATE storage.buckets");
    expect(migrationSql).toContain("WHERE id = 'agent-files'");
  });

  it("allows text attachment MIME types and common charset variants", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("'text/plain'");
    expect(migrationSql).toContain("'text/plain;charset=utf-8'");
    expect(migrationSql).toContain("'text/plain; charset=utf-8'");
    expect(migrationSql).toContain("'text/csv'");
    expect(migrationSql).toContain("'text/markdown'");
    expect(migrationSql).toContain("'application/json'");
    expect(migrationSql).toContain("'application/json;charset=utf-8'");
  });

  it("preserves previously allowed document and meeting audio types", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("'application/pdf'");
    expect(migrationSql).toContain("'application/vnd.openxmlformats-officedocument.wordprocessingml.document'");
    expect(migrationSql).toContain("'audio/webm'");
    expect(migrationSql).toContain("'audio/x-m4a'");
  });
});
