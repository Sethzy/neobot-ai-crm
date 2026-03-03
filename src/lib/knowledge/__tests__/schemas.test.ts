/**
 * Tests for Knowledge Base Zod schemas.
 * @module lib/knowledge/__tests__/schemas
 */
import { describe, expect, it } from "vitest";

import { vaultFileInsertSchema, vaultFileSchema } from "../schemas";

const validRow = {
  file_id: "550e8400-e29b-41d4-a716-446655440000",
  client_id: "660e8400-e29b-41d4-a716-446655440000",
  filename: "floor-plan.pdf",
  storage_path: "vault/floor-plan.pdf",
  title: "floor-plan",
  content_type: "application/pdf",
  size_bytes: 1024000,
  content: "Ground floor has open concept layout",
  tags: ["listing", "district-10"],
  summary: null,
  needs_reprocess: false,
  created_at: "2026-03-03T00:00:00.000Z",
  updated_at: "2026-03-03T00:00:00.000Z",
};

describe("vaultFileSchema", () => {
  it("validates a complete vault file row", () => {
    expect(vaultFileSchema.safeParse(validRow).success).toBe(true);
  });

  it("accepts nullable content_type, size_bytes, content, and summary", () => {
    const row = {
      ...validRow,
      content_type: null,
      size_bytes: null,
      content: null,
      summary: null,
    };

    expect(vaultFileSchema.safeParse(row).success).toBe(true);
  });

  it("rejects non-ISO timestamp strings", () => {
    const row = { ...validRow, created_at: "2026-03-03" };
    expect(vaultFileSchema.safeParse(row).success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { file_id: _omitted, ...incomplete } = validRow;
    expect(vaultFileSchema.safeParse(incomplete).success).toBe(false);
  });
});

describe("vaultFileInsertSchema", () => {
  it("validates a minimal insert payload", () => {
    const payload = {
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      filename: "notes.md",
      storage_path: "vault/notes.md",
      title: "notes",
    };

    expect(vaultFileInsertSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects empty filename", () => {
    const payload = {
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      filename: "",
      storage_path: "vault/notes.md",
      title: "notes",
    };

    expect(vaultFileInsertSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects storage paths outside vault/", () => {
    const payload = {
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      filename: "notes.md",
      storage_path: "skills/notes.md",
      title: "notes",
    };

    expect(vaultFileInsertSchema.safeParse(payload).success).toBe(false);
  });
});
