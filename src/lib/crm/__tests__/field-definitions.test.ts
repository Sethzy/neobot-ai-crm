import { describe, expect, it } from "vitest";

import {
  fieldDefinitionSchema,
  fieldTypeValues,
  type FieldDefinition,
  CONTACT_DEFAULT_FIELDS,
  COMPANY_DEFAULT_FIELDS,
  DEAL_DEFAULT_FIELDS,
} from "../field-definitions";

describe("fieldTypeValues", () => {
  it("includes all expected field types", () => {
    expect(fieldTypeValues).toContain("text");
    expect(fieldTypeValues).toContain("full_name");
    expect(fieldTypeValues).toContain("number");
    expect(fieldTypeValues).toContain("currency");
    expect(fieldTypeValues).toContain("email");
    expect(fieldTypeValues).toContain("phone");
    expect(fieldTypeValues).toContain("url");
    expect(fieldTypeValues).toContain("date");
    expect(fieldTypeValues).toContain("boolean");
    expect(fieldTypeValues).toContain("select");
    expect(fieldTypeValues).toContain("tags");
    expect(fieldTypeValues).toContain("richtext");
    expect(fieldTypeValues).toContain("file");
    expect(fieldTypeValues).toContain("relation");
  });
});

describe("fieldDefinitionSchema", () => {
  it("accepts a valid text field", () => {
    const field: FieldDefinition = {
      key: "city",
      label: "City",
      type: "text",
      source: "column",
      tier: "default",
      visible: true,
      order: 3,
      editable: true,
      required: false,
    };
    expect(fieldDefinitionSchema.parse(field)).toEqual(field);
  });

  it("accepts a select field with options", () => {
    const field: FieldDefinition = {
      key: "type",
      label: "Type",
      type: "select",
      source: "column",
      tier: "default",
      visible: true,
      order: 5,
      editable: true,
      required: false,
      options: ["buyer", "seller", "agent"],
    };
    const parsed = fieldDefinitionSchema.parse(field);
    expect(parsed.options).toEqual(["buyer", "seller", "agent"]);
  });

  it("rejects select field without options", () => {
    const field = {
      key: "status",
      label: "Status",
      type: "select",
      source: "custom",
      tier: "custom",
      visible: true,
      order: 10,
      editable: true,
      required: false,
    };
    expect(() => fieldDefinitionSchema.parse(field)).toThrow();
  });

  it("accepts a relation field with related_entity", () => {
    const field: FieldDefinition = {
      key: "company_id",
      label: "Company",
      type: "relation",
      source: "column",
      tier: "default",
      visible: true,
      order: 4,
      editable: true,
      required: false,
      related_entity: "companies",
    };
    const parsed = fieldDefinitionSchema.parse(field);
    expect(parsed.related_entity).toBe("companies");
  });

  it("rejects relation field without related_entity", () => {
    const field = {
      key: "linked",
      label: "Linked",
      type: "relation",
      source: "custom",
      tier: "custom",
      visible: true,
      order: 10,
      editable: true,
      required: false,
    };
    expect(() => fieldDefinitionSchema.parse(field)).toThrow();
  });

  it("accepts optional width", () => {
    const field: FieldDefinition = {
      key: "name",
      label: "Name",
      type: "full_name",
      source: "column",
      tier: "indestructible",
      visible: true,
      order: 0,
      editable: false,
      required: true,
      width: 200,
    };
    const parsed = fieldDefinitionSchema.parse(field);
    expect(parsed.width).toBe(200);
  });

  it("rejects invalid tier value", () => {
    const field = {
      key: "name",
      label: "Name",
      type: "text",
      source: "column",
      tier: "protected",
      visible: true,
      order: 0,
      editable: false,
      required: true,
    };
    expect(() => fieldDefinitionSchema.parse(field)).toThrow();
  });
});

describe("default field arrays", () => {
  it("CONTACT_DEFAULT_FIELDS has name as indestructible", () => {
    const nameField = CONTACT_DEFAULT_FIELDS.find((f) => f.key === "name");
    expect(nameField).toBeDefined();
    expect(nameField!.tier).toBe("indestructible");
    expect(nameField!.type).toBe("full_name");
    expect(nameField!.visible).toBe(true);
  });

  it("CONTACT_DEFAULT_FIELDS has email as default tier", () => {
    const emailField = CONTACT_DEFAULT_FIELDS.find((f) => f.key === "emails");
    expect(emailField).toBeDefined();
    expect(emailField!.tier).toBe("default");
    expect(emailField!.source).toBe("column");
  });

  it("COMPANY_DEFAULT_FIELDS has name as indestructible", () => {
    const nameField = COMPANY_DEFAULT_FIELDS.find((f) => f.key === "name");
    expect(nameField).toBeDefined();
    expect(nameField!.tier).toBe("indestructible");
  });

  it("DEAL_DEFAULT_FIELDS has name as indestructible", () => {
    const nameField = DEAL_DEFAULT_FIELDS.find((f) => f.key === "name");
    expect(nameField).toBeDefined();
    expect(nameField!.tier).toBe("indestructible");
    expect(nameField!.type).toBe("text");
  });

  it("DEAL_DEFAULT_FIELDS has address as default (demoted from identity)", () => {
    const addressField = DEAL_DEFAULT_FIELDS.find((f) => f.key === "address");
    expect(addressField).toBeDefined();
    expect(addressField!.tier).toBe("default");
  });

  it("all default field arrays have sequential order values", () => {
    for (const fields of [CONTACT_DEFAULT_FIELDS, COMPANY_DEFAULT_FIELDS, DEAL_DEFAULT_FIELDS]) {
      const orders = fields.map((f) => f.order);
      const sorted = [...orders].sort((a, b) => a - b);
      expect(orders).toEqual(sorted);
    }
  });

  it("all default field arrays pass schema validation", () => {
    for (const fields of [CONTACT_DEFAULT_FIELDS, COMPANY_DEFAULT_FIELDS, DEAL_DEFAULT_FIELDS]) {
      for (const field of fields) {
        expect(() => fieldDefinitionSchema.parse(field)).not.toThrow();
      }
    }
  });
});
