/**
 * @file Client configuration loader
 * @description Loads per-client configs from static registry.
 * Schema lookup removed - ExtendAI Dashboard is source of truth for extraction config.
 */

import type { ClientConfig } from "./types";
import { defaultConfig } from "./clients/default";
import { hohLawConfig } from "./clients/hoh-law";

/**
 * Static registry of client configurations.
 * Add new clients here as they are onboarded.
 */
const configs: Record<string, ClientConfig> = {
  default: defaultConfig,
  "hoh-law": hohLawConfig,
};

/**
 * Get client configuration by ID.
 * Falls back to default if ID not found or null.
 *
 * @param clientConfigId - Client config ID from user profile, or null
 * @returns ClientConfig for the given ID, or default config
 */
export function getClientConfig(clientConfigId: string | null): ClientConfig {
  const id = clientConfigId ?? "default";

  if (!configs[id]) {
    console.warn(`Unknown client_config_id: "${id}", using default`);
    return configs["default"];
  }

  return configs[id];
}

/**
 * Get list of available client config IDs.
 * Useful for admin UI or validation.
 */
export function getAvailableConfigIds(): string[] {
  return Object.keys(configs);
}
