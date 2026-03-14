/**
 * Tool to disable CRM configuration mode (agent self-service).
 * @module lib/runner/tools/crm/disable-config-mode
 */
import { tool } from "ai";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/server";

/**
 * Creates the disable_crm_config_mode tool.
 * The agent calls this to turn off config mode after finishing CRM reconfiguration.
 * Uses an admin client because RLS on `clients` only allows SELECT for user-scoped clients.
 */
export function createDisableConfigModeTool(
  clientId: string,
) {
  const disable_crm_config_mode = tool({
    description:
      "Disable CRM configuration mode for this workspace. " +
      "Call this after finishing CRM reconfiguration to remove the configure_crm tool from future turns. " +
      "The user activated config mode from Settings — you should disable it when done.",
    inputSchema: z.object({}),
    execute: async () => {
      const adminClient = await createAdminClient();
      const { error } = await adminClient
        .from("clients")
        .update({ crm_config_mode_until: null })
        .eq("client_id", clientId);

      if (error) {
        return { success: false as const, error: error.message };
      }

      return {
        success: true as const,
        message: "CRM configuration mode has been disabled. The configure_crm tool will no longer be available.",
      };
    },
  });

  return { disable_crm_config_mode };
}
