/**
 * Tests for the search_market_data tool search mode.
 * @module lib/runner/tools/market/__tests__/search-market-data
 */
import { describe, expect, it, vi } from "vitest";

import * as postgrestFilters from "@/lib/crm/postgrest-filters";

import { createMockSupabase } from "../../crm/__tests__/mock-supabase";
import { createSearchMarketDataTool } from "../search-market-data";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("createSearchMarketDataTool", () => {
  it("returns the search_market_data tool with execute function", () => {
    const { client } = createMockSupabase();

    const tools = createSearchMarketDataTool(client as never);

    expect(tools.search_market_data).toBeDefined();
    expect(tools.search_market_data.execute).toBeTypeOf("function");
  });

  describe("agents dataset", () => {
    it("searches cea_agents and returns results", async () => {
      const agents = [
        {
          registration_no: "R012345A",
          salesperson_name: "John Tan",
          estate_agent_name: "PropNex",
        },
      ];
      const { client, from } = createMockSupabase({
        cea_agents: { data: agents, error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "agents", agent_name: "John", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({
        success: true,
        dataset: "agents",
        results: agents,
        count: 1,
      });
      expect(from).toHaveBeenCalledWith("cea_agents");
    });

    it("calls buildIlikePattern for agent_name filter", async () => {
      const spy = vi.spyOn(postgrestFilters, "buildIlikePattern");
      const { client } = createMockSupabase({
        cea_agents: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "agents", agent_name: "John%Tan_", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(spy).toHaveBeenCalledWith("John%Tan_");
      spy.mockRestore();
    });

    it("applies exact match on uppercased registration number", async () => {
      const { client, builders } = createMockSupabase({
        cea_agents: { data: [{ registration_no: "R012345A" }], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "agents", agent_reg_no: "r012345a", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.cea_agents.eq).toHaveBeenCalledWith("registration_no", "R012345A");
    });

    it("silently ignores unsupported town and district filters", async () => {
      const { client, builders } = createMockSupabase({
        cea_agents: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "agents", town: "BEDOK", district: "15", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.cea_agents.eq).not.toHaveBeenCalledWith("town", expect.anything());
      expect(builders.cea_agents.eq).not.toHaveBeenCalledWith("district", expect.anything());
    });
  });

  describe("transactions dataset", () => {
    it("searches cea_transactions with normalized town filter", async () => {
      const transactions = [{ id: 1, town: "BEDOK", transaction_date: "2025-06-15" }];
      const { client, from, builders } = createMockSupabase({
        cea_transactions: { data: transactions, error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "transactions", town: "bedok", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({
        success: true,
        dataset: "transactions",
        results: transactions,
        count: 1,
      });
      expect(from).toHaveBeenCalledWith("cea_transactions");
      expect(builders.cea_transactions.eq).toHaveBeenCalledWith("town", "BEDOK");
    });

    it("applies date range filters", async () => {
      const { client, builders } = createMockSupabase({
        cea_transactions: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        {
          dataset: "transactions",
          date_from: "2025-01-01",
          date_to: "2025-12-31",
          mode: "search",
        },
        EXECUTION_OPTIONS,
      );

      expect(builders.cea_transactions.gte).toHaveBeenCalledWith("transaction_date", "2025-01-01");
      expect(builders.cea_transactions.lte).toHaveBeenCalledWith("transaction_date", "2025-12-31");
    });

    it("returns an error when date_from is after date_to", async () => {
      const { client } = createMockSupabase({
        cea_transactions: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        {
          dataset: "transactions",
          date_from: "2025-12-31",
          date_to: "2025-01-01",
          mode: "search",
        },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({
        success: false,
        error: "date_from must be on or before date_to",
      });
    });

    it("returns an error when date_from is not a real calendar date", async () => {
      const { client } = createMockSupabase({
        cea_transactions: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        {
          dataset: "transactions",
          date_from: "2025-02-31",
          mode: "search",
        },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({
        success: false,
        error: "date_from must be a real calendar date in YYYY-MM-DD format",
      });
    });
  });

  describe("hdb dataset", () => {
    it("searches hdb_resale_transactions with town and flat type", async () => {
      const rows = [{ id: 1, town: "BEDOK", flat_type: "4 ROOM", resale_price: 500000 }];
      const { client, from } = createMockSupabase({
        hdb_resale_transactions: { data: rows, error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "hdb", town: "BEDOK", flat_type: "4 ROOM", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({
        success: true,
        dataset: "hdb",
        results: rows,
        count: 1,
      });
      expect(from).toHaveBeenCalledWith("hdb_resale_transactions");
    });

    it("silently ignores district filter because hdb has no district column", async () => {
      const { client, builders } = createMockSupabase({
        hdb_resale_transactions: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "hdb", district: "15", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.hdb_resale_transactions.eq).not.toHaveBeenCalledWith(
        "district",
        expect.anything(),
      );
    });
  });

  describe("ura dataset", () => {
    it("normalizes numeric district to zero-padded string", async () => {
      const { client, builders } = createMockSupabase({
        ura_transactions: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "ura", district: "1", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.ura_transactions.eq).toHaveBeenCalledWith("district", "01");
    });

    it("extracts district number from human text", async () => {
      const { client, builders } = createMockSupabase({
        ura_transactions: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "ura", district: "District 15", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.ura_transactions.eq).toHaveBeenCalledWith("district", "15");
    });

    it("passes the escaped ilike pattern to the query builder", async () => {
      const spy = vi.spyOn(postgrestFilters, "buildIlikePattern").mockReturnValue("%escaped%");
      const { client, builders } = createMockSupabase({
        ura_transactions: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "ura", project: "50% off_", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.ura_transactions.ilike).toHaveBeenCalledWith("project", "%escaped%");
      spy.mockRestore();
    });
  });

  describe("error handling and limits", () => {
    it("returns error on Supabase query failure", async () => {
      const { client } = createMockSupabase({
        cea_agents: { data: null, error: { message: "relation does not exist" } },
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "agents", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({ success: false, error: "relation does not exist" });
    });

    it("defaults to 20 results", async () => {
      const { client, builders } = createMockSupabase({
        cea_agents: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "agents", mode: "search" },
        EXECUTION_OPTIONS,
      );

      expect(builders.cea_agents.limit).toHaveBeenCalledWith(20);
    });

    it("respects a custom limit", async () => {
      const { client, builders } = createMockSupabase({
        cea_agents: { data: [], error: null },
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "agents", mode: "search", limit: 5 },
        EXECUTION_OPTIONS,
      );

      expect(builders.cea_agents.limit).toHaveBeenCalledWith(5);
    });

  });
});
