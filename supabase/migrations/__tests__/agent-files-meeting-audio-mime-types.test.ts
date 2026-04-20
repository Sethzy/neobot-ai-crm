/**
 * Contract tests for the meeting-audio MIME allowlist migration.
 * @module supabase/migrations/__tests__/agent-files-meeting-audio-mime-types
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260419204611_allow_meeting_audio_upload_mime_types.sql",
);

describe("agent-files meeting audio MIME migration", () => {
  it("updates the existing agent-files bucket", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("UPDATE storage.buckets");
    expect(migrationSql).toContain("WHERE id = 'agent-files'");
  });

  it("adds the meeting recorder audio MIME types to the bucket allowlist", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("'audio/webm'");
    expect(migrationSql).toContain("'audio/mp4'");
    expect(migrationSql).toContain("'audio/mpeg'");
    expect(migrationSql).toContain("'audio/ogg'");
    expect(migrationSql).toContain("'audio/wav'");
    expect(migrationSql).toContain("'audio/x-m4a'");
  });
});
