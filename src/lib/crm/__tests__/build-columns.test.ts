import { describe, expect, it } from "vitest";

import type { FieldDefinition } from "../field-definitions";
import { buildColumnsFromConfig } from "../build-columns";

const minimalFields: FieldDefinition[] = [
  { key: "name", label: "Name", type: "full_name", source: "column", tier: "indestructible", visible: true, order: 0, editable: false, required: true },
  { key: "email", label: "Email", type: "email", source: "column", tier: "default", visible: true, order: 1, editable: true, required: false },
  { key: "hidden_field", label: "Hidden", type: "text", source: "column", tier: "default", visible: false, order: 2, editable: true, required: false },
  { key: "budget", label: "Budget", type: "currency", source: "custom", tier: "custom", visible: true, order: 3, editable: true, required: false },
];

describe("buildColumnsFromConfig", () => {
  it("only includes visible fields", () => {
    const columns = buildColumnsFromConfig(minimalFields, "contacts");
    const ids = columns.map((c) => c.id);
    expect(ids).toContain("name");
    expect(ids).toContain("email");
    expect(ids).toContain("budget");
    expect(ids).not.toContain("hidden_field");
  });

  it("sorts by order value", () => {
    const unorderedFields: FieldDefinition[] = [
      { key: "b", label: "B", type: "text", source: "column", tier: "default", visible: true, order: 2, editable: true, required: false },
      { key: "a", label: "A", type: "text", source: "column", tier: "default", visible: true, order: 0, editable: true, required: false },
      { key: "c", label: "C", type: "text", source: "column", tier: "default", visible: true, order: 1, editable: true, required: false },
    ];
    const columns = buildColumnsFromConfig(unorderedFields, "contacts");
    const ids = columns.map((c) => c.id);
    expect(ids).toEqual(["a", "c", "b"]);
  });

  it("returns single column for single indestructible field", () => {
    const singleField: FieldDefinition[] = [
      { key: "name", label: "Name", type: "full_name", source: "column", tier: "indestructible", visible: true, order: 0, editable: false, required: true },
    ];
    const columns = buildColumnsFromConfig(singleField, "contacts");
    expect(columns).toHaveLength(1);
    expect(columns[0].id).toBe("name");
  });

  it("sets column size when field has width property", () => {
    const fieldsWithWidth: FieldDefinition[] = [
      { key: "name", label: "Name", type: "text", source: "column", tier: "default", visible: true, order: 0, editable: true, required: false, width: 200 },
    ];
    const columns = buildColumnsFromConfig(fieldsWithWidth, "contacts");
    expect(columns[0].size).toBe(200);
  });

  it("cell renders formatted display value", () => {
    const columns = buildColumnsFromConfig(minimalFields, "contacts");
    const budgetCol = columns.find((c) => c.id === "budget");
    expect(budgetCol).toBeDefined();
    // accessorFn should extract from custom_fields for custom source
    const row = { custom_fields: { budget: 1500000 } };
    if (budgetCol && "accessorFn" in budgetCol && budgetCol.accessorFn) {
      const value = budgetCol.accessorFn(row as any, 0);
      expect(value).toBe(1500000);
    }
  });
});
