/**
 * Tests for Knowledge Base PostgREST search filter builders.
 * @module lib/knowledge/__tests__/postgrest-filters
 */
import { describe, expect, it } from "vitest";

import { buildVaultSearchOrFilter } from "../postgrest-filters";

describe("buildVaultSearchOrFilter", () => {
  it("builds ILIKE filter for title, filename, summary, and content", () => {
    const result = buildVaultSearchOrFilter("floor plan");
    expect(result).toContain("title.ilike.");
    expect(result).toContain("filename.ilike.");
    expect(result).toContain("summary.ilike.");
    expect(result).toContain("content.ilike.");
    expect(result).toContain("floor plan");
  });

  it("escapes PostgREST special characters", () => {
    const result = buildVaultSearchOrFilter("100%_match");
    expect(result).toContain("100\\%\\_match");
  });

  it("produces exactly four OR clauses", () => {
    const result = buildVaultSearchOrFilter("test");
    const clauses = result.split(",");
    expect(clauses).toHaveLength(4);
    expect(clauses[0]).toMatch(/^title\.ilike\./);
    expect(clauses[1]).toMatch(/^filename\.ilike\./);
    expect(clauses[2]).toMatch(/^summary\.ilike\./);
    expect(clauses[3]).toMatch(/^content\.ilike\./);
  });
});
