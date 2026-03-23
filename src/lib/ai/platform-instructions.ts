/**
 * Platform-level operational instructions for the runner.
 * @module lib/ai/platform-instructions
 */
import { CRM_DEFAULTS, type CrmVocabConfig } from "@/lib/crm/config";
import { escapeXml } from "@/lib/runner/system-reminder";

const BASE_PLATFORM_INSTRUCTIONS = `<platform-instructions>
<tasks>
You have a thread-scoped scratchpad todo list.

Use list_todo at the start of a run to check unfinished items.
Use manage_todo to add, update, or delete your own notes-to-self.

Todos are for internal execution planning, not user-facing CRM reminders.
For user-facing follow-ups and deadlines, use CRM task tools.

Delete completed todo entries to keep the scratchpad clean.
</tasks>

<sql-db>
You can run read-only sql queries against client-accessible tables.

Use get_agent_db_schema first to inspect tables and columns.
Use run_sql for single-statement SELECT/CTE analysis.

CRM tables available: contacts, companies, deals, interactions, crm_tasks, deal_contacts.
RLS is enforced: you can only read rows for the current client.
Prefer search_crm for simple lookups; use run_sql when you need JOINs or aggregations.
</sql-db>

<state-directory>
Use the /agent/state/ directory for ephemeral working files during multi-step workflows.

Examples:
- /agent/state/draft-email.md
- /agent/state/research-notes.md

Clean up /agent/state/ files after the work is complete.
</state-directory>

<thread-naming>
Thread titles are usually auto-generated after the first user message.
Use rename_chat only when the current title is untitled/generic and you can provide a better concise title.
Do not rename threads that already have a meaningful specific title.
</thread-naming>

</platform-instructions>`;

type PartialCrmVocabularyConfig = Partial<CrmVocabConfig>;

function normalizeCrmVocabularyConfig(config: PartialCrmVocabularyConfig): CrmVocabConfig {
  return {
    deal_label: config.deal_label ?? CRM_DEFAULTS.deal_label,
    company_label: config.company_label ?? CRM_DEFAULTS.company_label,
    deal_stages: config.deal_stages ?? CRM_DEFAULTS.deal_stages,
    contact_types: config.contact_types ?? CRM_DEFAULTS.contact_types,
    interaction_types: config.interaction_types ?? CRM_DEFAULTS.interaction_types,
    deal_contact_roles: config.deal_contact_roles ?? CRM_DEFAULTS.deal_contact_roles,
    company_industries: config.company_industries ?? CRM_DEFAULTS.company_industries,
    deal_custom_fields: config.deal_custom_fields ?? CRM_DEFAULTS.deal_custom_fields,
    contact_custom_fields: config.contact_custom_fields ?? CRM_DEFAULTS.contact_custom_fields,
    company_custom_fields: config.company_custom_fields ?? CRM_DEFAULTS.company_custom_fields,
    task_custom_fields: config.task_custom_fields ?? CRM_DEFAULTS.task_custom_fields,
  };
}

function formatCustomFieldDefinitionSummary(config: CrmVocabConfig) {
  const lines: string[] = [];

  const collections = [
    ["Deal custom fields", config.deal_custom_fields],
    ["Contact custom fields", config.contact_custom_fields],
    ["Company custom fields", config.company_custom_fields],
    ["Task custom fields", config.task_custom_fields],
  ] as const;

  for (const [label, definitions] of collections) {
    if (definitions.length === 0) {
      lines.push(`${label}: none`);
      continue;
    }

    const summary = definitions.map((definition) => {
      const optionValues = definition.options ?? [];
      const options = definition.type === "select" && optionValues.length > 0
        ? ` [options: ${optionValues.map(escapeXml).join(", ")}]`
        : "";

      return `${escapeXml(definition.key)} — ${escapeXml(definition.label)} (${definition.type}${definition.required ? ", required" : ""})${options}`;
    }).join("; ");

    lines.push(`${label}: ${summary}`);
  }

  return lines.join("\n");
}

function buildCrmVocabularyBlock(config: PartialCrmVocabularyConfig) {
  const normalizedConfig = normalizeCrmVocabularyConfig(config);

  return `<crm-vocabulary>
Deal label: ${escapeXml(normalizedConfig.deal_label)}
Company label: ${escapeXml(normalizedConfig.company_label)}
Deal stages: ${normalizedConfig.deal_stages.map(escapeXml).join(", ")}
Contact types: ${normalizedConfig.contact_types.map(escapeXml).join(", ")}
Company industries: ${normalizedConfig.company_industries.map(escapeXml).join(", ")}
Interaction types: ${normalizedConfig.interaction_types.map(escapeXml).join(", ")}
Deal contact roles: ${normalizedConfig.deal_contact_roles.map(escapeXml).join(", ")}
${formatCustomFieldDefinitionSummary(normalizedConfig)}
</crm-vocabulary>`;
}

/**
 * Builds platform instructions, optionally appending CRM vocabulary for the active client.
 */
export function buildPlatformInstructions(config?: PartialCrmVocabularyConfig) {
  if (!config) {
    return BASE_PLATFORM_INSTRUCTIONS;
  }

  return `${BASE_PLATFORM_INSTRUCTIONS}\n\n${buildCrmVocabularyBlock(config)}`;
}

export const PLATFORM_INSTRUCTIONS = buildPlatformInstructions();
