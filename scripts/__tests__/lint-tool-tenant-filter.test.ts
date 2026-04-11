import path from "node:path";

import { describe, expect, it } from "vitest";

import { lintToolTenantFilter } from "../lint-tool-tenant-filter";

const FIXTURES = path.join(
  __dirname,
  "..",
  "__fixtures__",
  "lint-tool-tenant-filter",
);

describe("lintToolTenantFilter", () => {
  it("accepts a tool with an explicit .eq('client_id', ...) filter", () => {
    const violations = lintToolTenantFilter([path.join(FIXTURES, "good-tool.ts")]);
    expect(violations).toEqual([]);
  });

  it("flags a tool that omits the client_id filter", () => {
    const violations = lintToolTenantFilter([path.join(FIXTURES, "bad-tool.ts")]);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toContain("bad-tool.ts");
    expect(violations[0].table).toBe("contacts");
    expect(violations[0].line).toBeGreaterThan(0);
  });

  it("flags a tool that filters on client_id with the wrong value", () => {
    const violations = lintToolTenantFilter([path.join(FIXTURES, "wrong-client-id-tool.ts")]);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toContain("wrong-client-id-tool.ts");
    expect(violations[0].reason).toContain('context.clientId');
  });

  it("accepts a write tool that explicitly inserts client_id from context", () => {
    const violations = lintToolTenantFilter([path.join(FIXTURES, "write-good-tool.ts")]);
    expect(violations).toEqual([]);
  });

  it("flags a write tool that omits the inserted client_id", () => {
    const violations = lintToolTenantFilter([path.join(FIXTURES, "write-bad-tool.ts")]);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toContain("write-bad-tool.ts");
    expect(violations[0].reason).toContain('client_id');
  });

  it("accepts a @tenant-neutral annotated .from() call", () => {
    const violations = lintToolTenantFilter([
      path.join(FIXTURES, "tenant-neutral-tool.ts"),
    ]);
    expect(violations).toEqual([]);
  });
});
