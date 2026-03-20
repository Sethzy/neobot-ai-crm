/**
 * Market data tool factory barrel for runner registration.
 * @module lib/runner/tools/market
 */
import { createPropertyPublicServerClient } from "@/lib/supabase/property-public-server";

import { createSearchMarketDataTool } from "./search-market-data";

/**
 * Creates the market-data search tools backed by the public property Supabase client.
 */
export function createMarketTools() {
  const propertySupabase = createPropertyPublicServerClient();

  return {
    ...createSearchMarketDataTool(propertySupabase),
  };
}
