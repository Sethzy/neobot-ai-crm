/**
 * Market data tool factory barrel for runner registration.
 * @module lib/runner/tools/market
 */
import { createPropertyPublicServerClient } from "@/lib/supabase/property-public-server";

import { createSearch99coTool } from "./search-99co";
import { createSearchPropertyguruTool } from "./search-propertyguru";
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

/**
 * Creates the Apify-backed public listing tools without any Supabase dependency.
 */
export function createListingTools() {
  return {
    ...createSearch99coTool(),
    ...createSearchPropertyguruTool(),
  };
}
