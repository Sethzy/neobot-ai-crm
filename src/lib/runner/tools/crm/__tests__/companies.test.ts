/**
 * Tests for CRM company tools.
 * @module lib/runner/tools/crm/__tests__/companies
 */
import { describe, expect, it } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";

import { createCompanyTools } from "../companies";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

const CONFIGURED_COMPANY_CONFIG = {
  ...CRM_DEFAULTS,
  company_label: "Brokerage",
  company_industries: ["residential", "commercial"],
  company_custom_fields: [
    { key: "hq", label: "HQ", type: "text" as const, required: true },
    { key: "headcount", label: "Headcount", type: "number" as const },
  ],
};

describe("search_companies", () => {
  it("returns matching companies for a query", async () => {
    const companies = [
      {
        company_id: "550e8400-e29b-41d4-a716-446655440000",
        name: "PropNex Realty",
        industry: "residential",
        website: "https://propnex.com",
        phone: "+6562201000",
        email: "info@propnex.com",
        address: "480 Lorong 6 Toa Payoh",
        notes: null,
        custom_fields: {},
      },
    ];
    const { client, builders } = createMockSupabase({
      companies: { data: companies, error: null },
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.search_companies.execute(
      { query: "PropNex" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, companies, count: 1 });
    expect(builders.companies.or).toHaveBeenCalledWith(
      expect.stringContaining("PropNex"),
    );
  });

  it("applies industry filter when provided", async () => {
    const { client, builders } = createMockSupabase({
      companies: { data: [], error: null },
    });
    const tools = createCompanyTools(client, CLIENT_ID, CONFIGURED_COMPANY_CONFIG);

    await tools.search_companies.execute(
      { query: "test", industry: "residential" },
      EXECUTION_OPTIONS,
    );

    expect(builders.companies.eq).toHaveBeenCalledWith(
      "industry",
      "residential",
    );
  });

  it("defaults to limit 20", async () => {
    const { client, builders } = createMockSupabase({
      companies: { data: [], error: null },
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    await tools.search_companies.execute({ query: "test" }, EXECUTION_OPTIONS);

    expect(builders.companies.limit).toHaveBeenCalledWith(20);
  });

  it("uses config-driven company label and industry values", () => {
    const { client } = createMockSupabase();
    const tools = createCompanyTools(client, CLIENT_ID, CONFIGURED_COMPANY_CONFIG);

    expect(tools.search_companies.description).toContain("Brokerage");
    expect(tools.search_companies.inputSchema.safeParse({ industry: "commercial" }).success).toBe(true);
    expect(tools.search_companies.inputSchema.safeParse({ industry: "developer" }).success).toBe(false);
  });
});

describe("create_company", () => {
  it("creates and returns a company when no duplicates found", async () => {
    const created = {
      company_id: "550e8400-e29b-41d4-a716-446655440001",
      client_id: CLIENT_ID,
      name: "ERA Realty",
      industry: "residential",
      website: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      custom_fields: { hq: "Singapore", headcount: 9500 },
      created_at: "2026-03-07T00:00:00Z",
      updated_at: "2026-03-07T00:00:00Z",
    };
    const { client, builderHistory } = createMockSupabase({
      companies: [
        { data: [], error: null },
        { data: created, error: null },
      ],
    });
    const tools = createCompanyTools(client, CLIENT_ID, CONFIGURED_COMPANY_CONFIG);

    const result = await tools.create_company.execute(
      {
        name: "ERA Realty",
        industry: "residential",
        custom_fields: { hq: "Singapore", headcount: 9500 },
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, company: created });
    expect(builderHistory.companies[0].ilike).toHaveBeenCalledWith(
      "name",
      "%ERA Realty%",
    );
    expect(builderHistory.companies[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        name: "ERA Realty",
        industry: "residential",
        custom_fields: { hq: "Singapore", headcount: 9500 },
      }),
    );
  });

  it("returns possible_duplicates when matching company exists", async () => {
    const existing = [
      {
        company_id: "existing-1",
        name: "ERA Realty",
        industry: "residential",
      },
    ];
    const { client } = createMockSupabase({
      companies: { data: existing, error: null },
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.create_company.execute(
      { name: "ERA Realty" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      reason: "possible_duplicates",
      possible_duplicates: existing,
      message: expect.stringContaining("ERA Realty"),
    });
  });
});

describe("update_company", () => {
  it("updates and returns a company", async () => {
    const updated = {
      company_id: "550e8400-e29b-41d4-a716-446655440002",
      client_id: CLIENT_ID,
      name: "Updated Realty",
      industry: "commercial",
      website: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      custom_fields: {},
      created_at: "2026-03-07T00:00:00Z",
      updated_at: "2026-03-07T01:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      companies: { data: updated, error: null },
    });
    const tools = createCompanyTools(client, CLIENT_ID, CONFIGURED_COMPANY_CONFIG);

    const result = await tools.update_company.execute(
      {
        company_id: "550e8400-e29b-41d4-a716-446655440002",
        industry: "commercial",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, company: updated });
    expect(builders.companies.update).toHaveBeenCalledWith(
      expect.objectContaining({ industry: "commercial" }),
    );
    expect(builders.companies.eq).toHaveBeenCalledWith(
      "company_id",
      "550e8400-e29b-41d4-a716-446655440002",
    );
  });

  it("returns an error when no fields are provided", async () => {
    const { client } = createMockSupabase();
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.update_company.execute(
      { company_id: "550e8400-e29b-41d4-a716-446655440002" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "No fields to update" });
  });

  it("merges company custom_fields patches on update", async () => {
    const existing = {
      company_id: "550e8400-e29b-41d4-a716-446655440002",
      client_id: CLIENT_ID,
      custom_fields: { hq: "Singapore", headcount: 9000 },
    };
    const updated = {
      ...existing,
      name: "ERA Realty",
      industry: "residential",
      website: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      created_at: "2026-03-07T00:00:00Z",
      updated_at: "2026-03-07T01:00:00Z",
      custom_fields: { hq: "Singapore", headcount: 9500 },
    };
    const { client, builderHistory } = createMockSupabase({
      companies: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });
    const tools = createCompanyTools(client, CLIENT_ID, CONFIGURED_COMPANY_CONFIG);

    const result = await tools.update_company.execute(
      {
        company_id: existing.company_id,
        custom_fields: { headcount: 9500 },
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, company: updated });
    expect(builderHistory.companies[1].update).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_fields: { hq: "Singapore", headcount: 9500 },
      }),
    );
  });
});

describe("batch_create_companies", () => {
  it("creates multiple companies in a single call", async () => {
    const created = [
      {
        company_id: "cmp-1",
        client_id: CLIENT_ID,
        name: "PropNex Realty",
        industry: "residential",
        custom_fields: { hq: "Singapore" },
      },
      {
        company_id: "cmp-2",
        client_id: CLIENT_ID,
        name: "Far East Org",
        industry: "commercial",
        custom_fields: { hq: "Singapore", headcount: 1200 },
      },
    ];
    const { client, builders } = createMockSupabase({
      companies: { data: created, error: null },
    });
    const tools = createCompanyTools(client, CLIENT_ID, CONFIGURED_COMPANY_CONFIG);

    const result = await tools.batch_create_companies.execute(
      {
        companies: [
          {
            name: "PropNex Realty",
            industry: "residential",
            custom_fields: { hq: "Singapore" },
          },
          {
            name: "Far East Org",
            industry: "commercial",
            custom_fields: { hq: "Singapore", headcount: 1200 },
          },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, companies: created, count: 2 });
    expect(builders.companies.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ client_id: CLIENT_ID, name: "PropNex Realty" }),
        expect.objectContaining({ client_id: CLIENT_ID, name: "Far East Org" }),
      ]),
    );
  });
});
