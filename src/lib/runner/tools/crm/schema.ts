/**
 * CRM schema introspection tool for the runner.
 * @module lib/runner/tools/crm/schema
 */
import { tool } from "ai";
import { z } from "zod";

import type { CrmVocabConfig } from "@/lib/crm/config";

/**
 * Creates the schema introspection tool.
 *
 * Only needs the resolved `config` — no DB access required since the config
 * is already loaded at runner startup.
 */
export function createSchemaTools(config: CrmVocabConfig) {
  const describe_crm_schema = tool({
    description:
      "Returns the resolved CRM schema for this client, including entity labels, " +
      "pipeline stages, contact types, interaction types, deal-contact roles, " +
      "company industries, and custom field definitions. " +
      "Use this to discover what fields and options are available before creating or searching records.",
    inputSchema: z.object({}),
    execute: async () => {
      return {
        success: true as const,
        schema: {
          deal_label: config.deal_label,
          company_label: config.company_label,
          deal_stages: config.deal_stages,
          contact_types: config.contact_types,
          interaction_types: config.interaction_types,
          deal_contact_roles: config.deal_contact_roles,
          company_industries: config.company_industries,
          deal_custom_fields: config.deal_custom_fields,
          contact_custom_fields: config.contact_custom_fields,
          company_custom_fields: config.company_custom_fields,
          task_custom_fields: config.task_custom_fields,
        },
      };
    },
  });

  return {
    describe_crm_schema,
  };
}
