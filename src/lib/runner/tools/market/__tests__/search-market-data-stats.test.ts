/**
 * Tests for the search_market_data tool stats mode.
 * @module lib/runner/tools/market/__tests__/search-market-data-stats
 */
import { describe, expect, it } from "vitest";

import { createMockSupabase } from "../../crm/__tests__/mock-supabase";
import { createSearchMarketDataTool } from "../search-market-data";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("search_market_data stats mode", () => {
  describe("count-only datasets", () => {
    it("returns agent count without fetching sample rows", async () => {
      const { client, from } = createMockSupabase({
        cea_agents: { data: null, error: null, count: 42 },
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "agents", agency_name: "ERA", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({
        success: true,
        dataset: "agents",
        stats: { totalAgents: 42 },
        totalMatching: 42,
      });
      expect(from).toHaveBeenCalledTimes(1);
    });

    it("returns transaction count without fetching sample rows", async () => {
      const { client, from } = createMockSupabase({
        cea_transactions: { data: null, error: null, count: 1234 },
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "transactions", agent_reg_no: "R012345A", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({
        success: true,
        dataset: "transactions",
        stats: { totalTransactions: 1234 },
        totalMatching: 1234,
      });
      expect(from).toHaveBeenCalledTimes(1);
    });
  });

  describe("hdb stats", () => {
    it("returns price and PSF stats", async () => {
      const { client } = createMockSupabase({
        hdb_resale_transactions: [
          {
            data: [
              { resale_price: 400000, floor_area_sqm: 90 },
              { resale_price: 500000, floor_area_sqm: 95 },
              { resale_price: 600000, floor_area_sqm: 100 },
            ],
            error: null,
          },
          { data: null, error: null, count: 3 },
        ],
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "hdb", town: "BEDOK", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }

      expect(result.dataset).toBe("hdb");
      expect(result.totalMatching).toBe(3);
      expect(result.stats.totalTransactions).toBe(3);
      expect(result.stats.medianPrice).toBe(500000);
      expect(result.stats.avgPrice).toBe(500000);
      expect(result.stats.priceRange).toEqual({ min: 400000, max: 600000 });
      expect(result.stats.avgPsf).toBeTypeOf("number");
      expect(result.stats.avgPsf).toBeGreaterThan(0);
      expect(result.stats.medianPsf).toBeTypeOf("number");
    });

    it("selects only price columns for the sample query", async () => {
      const { client, builders } = createMockSupabase({
        hdb_resale_transactions: [
          { data: [], error: null },
          { data: null, error: null, count: 0 },
        ],
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "hdb", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(builders.hdb_resale_transactions.select).toHaveBeenCalledWith(
        "resale_price, floor_area_sqm",
      );
    });
  });

  describe("ura stats", () => {
    it("returns price and PSF stats", async () => {
      const { client } = createMockSupabase({
        ura_transactions: [
          {
            data: [
              { price: 1000000, price_psf: 1500 },
              { price: 2000000, price_psf: 2000 },
            ],
            error: null,
          },
          { data: null, error: null, count: 2 },
        ],
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "ura", district: "15", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({
        success: true,
        dataset: "ura",
        stats: {
          totalTransactions: 2,
          medianPrice: 1500000,
          avgPrice: 1500000,
          priceRange: { min: 1000000, max: 2000000 },
          avgPsf: 1750,
          medianPsf: 1750,
        },
        totalMatching: 2,
      });
    });

    it("selects only price columns for the sample query", async () => {
      const { client, builders } = createMockSupabase({
        ura_transactions: [
          { data: [], error: null },
          { data: null, error: null, count: 0 },
        ],
      });
      const tools = createSearchMarketDataTool(client as never);

      await tools.search_market_data.execute(
        { dataset: "ura", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(builders.ura_transactions.select).toHaveBeenCalledWith("price, price_psf");
    });
  });

  describe("sampling metadata", () => {
    it("includes sampled metadata when the total exceeds the sample limit", async () => {
      const { client } = createMockSupabase({
        ura_transactions: [
          { data: [{ price: 1000000, price_psf: 1500 }], error: null },
          { data: null, error: null, count: 500000 },
        ],
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "ura", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }

      expect(result.totalMatching).toBe(500000);
      expect(result.sampled).toBe(true);
      expect(result.sampleSize).toBe(10000);
    });

    it("omits sampled metadata when the total is within the sample limit", async () => {
      const { client } = createMockSupabase({
        hdb_resale_transactions: [
          { data: [{ resale_price: 500000, floor_area_sqm: 90 }], error: null },
          { data: null, error: null, count: 1 },
        ],
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "hdb", town: "BEDOK", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }

      expect(result.totalMatching).toBe(1);
      expect(result).not.toHaveProperty("sampled");
      expect(result).not.toHaveProperty("sampleSize");
    });
  });

  describe("empty results", () => {
    it("returns null aggregates for empty ura result sets", async () => {
      const { client } = createMockSupabase({
        ura_transactions: [
          { data: [], error: null },
          { data: null, error: null, count: 0 },
        ],
      });
      const tools = createSearchMarketDataTool(client as never);

      const result = await tools.search_market_data.execute(
        { dataset: "ura", district: "99", mode: "stats" },
        EXECUTION_OPTIONS,
      );

      expect(result).toEqual({
        success: true,
        dataset: "ura",
        stats: {
          totalTransactions: 0,
          medianPrice: null,
          avgPrice: null,
          priceRange: null,
          avgPsf: null,
          medianPsf: null,
        },
        totalMatching: 0,
      });
    });
  });
});
