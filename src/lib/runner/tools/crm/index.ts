/**
 * CRM tool factory barrel for the runner.
 * @module lib/runner/tools/crm
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { CRM_DEFAULTS, type CrmVocabConfig } from "@/lib/crm/config";
import type { Database } from "@/types/database";

import { createConfigureCrmTool } from "./configure-crm";
import { createCreateRecordTool } from "./create-record";
import { createDeleteRecordsTool } from "./delete-records";
import { createInteractionTools } from "./interactions";
import { createLinkRecordsTool } from "./link-records";
import { createSearchCrmTool } from "./search";
import { createTaskTools } from "./tasks";
import { createUpdateRecordTool } from "./update-record";

interface CreateCrmToolsOptions {
  /** Explicit CRM tool mode for the current run. */
  mode?: "normal" | "setup";
  /** Runtime CRM vocabulary/custom-field config for normal mode. */
  config?: CrmVocabConfig;
  /**
   * Enables mutating CRM tools for the active run.
   */
  allowWriteTools?: boolean;
  /**
   * Deliberate RUNNER-06 exception: subagents cannot surface approval cards,
   * so approval-gated delete tools can be withheld from their registry.
   */
  allowDeleteTools?: boolean;
}

/**
 * Creates all CRM tools for registration in `streamText({ tools })`.
 */
export function createCrmTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  options?: CreateCrmToolsOptions,
) {
  const {
    allowWriteTools = true,
    allowDeleteTools = true,
    mode = "normal",
    config = CRM_DEFAULTS,
  } = options ?? {};

  if (mode === "setup") {
    return createConfigureCrmTool(supabase, clientId);
  }

  const searchTools = createSearchCrmTool(supabase, clientId);

  const readTools = {
    search_crm: searchTools.search_crm,
  };

  if (!allowWriteTools) {
    return readTools;
  }

  const createRecordTools = createCreateRecordTool(supabase, clientId, config);
  const updateRecordTools = createUpdateRecordTool(supabase, clientId, config);
  const linkRecordTools = createLinkRecordsTool(supabase, clientId, config);
  const interactionTools = createInteractionTools(supabase, clientId, config);
  const taskTools = createTaskTools(supabase, clientId, config);

  return {
    ...readTools,
    create_record: createRecordTools.create_record,
    update_record: updateRecordTools.update_record,
    link_records: linkRecordTools.link_records,
    create_interaction: interactionTools.create_interaction,
    create_task: taskTools.create_task,
    update_task: taskTools.update_task,
    ...(allowDeleteTools ? {
      delete_records: createDeleteRecordsTool(supabase, clientId).delete_records,
    } : {}),
  };
}
