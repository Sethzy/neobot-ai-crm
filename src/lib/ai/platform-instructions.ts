/**
 * Platform-level operational instructions for the runner.
 * @module lib/ai/platform-instructions
 */
import type { CrmVocabConfig } from "@/lib/crm/config";
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
You can run read-only sql queries against the CRM database.

Use get_agent_db_schema first to inspect tables and columns.
Use run_agent_memory_sql for single-statement SELECT/CTE analysis.

RLS is enforced: you can only read rows for the current client.
Prefer CRM search tools for simple lookups; use sql for aggregations, joins, and complex filters.
</sql-db>

<state-directory>
Use the state/ directory for ephemeral working files during multi-step workflows.

Examples:
- state/draft-email.md
- state/research-notes.md

Clean up state/ files after the work is complete.
</state-directory>

<thread-naming>
Thread titles are usually auto-generated after the first user message.
Use rename_chat only when the current title is untitled/generic and you can provide a better concise title.
Do not rename threads that already have a meaningful specific title.
</thread-naming>
</platform-instructions>`;

function formatCustomFieldDefinitionSummary(config: CrmVocabConfig) {
  const lines: string[] = [];

  const collections = [
    ["Deal custom fields", config.deal_custom_fields],
    ["Contact custom fields", config.contact_custom_fields],
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

function buildCrmVocabularyBlock(config: CrmVocabConfig) {
  return `<crm-vocabulary>
Deal label: ${escapeXml(config.deal_label)}
Deal stages: ${config.deal_stages.map(escapeXml).join(", ")}
Contact types: ${config.contact_types.map(escapeXml).join(", ")}
Interaction types: ${config.interaction_types.map(escapeXml).join(", ")}
Deal contact roles: ${config.deal_contact_roles.map(escapeXml).join(", ")}
${formatCustomFieldDefinitionSummary(config)}
</crm-vocabulary>`;
}

/**
 * Builds platform instructions, optionally appending CRM vocabulary for the active client.
 */
export function buildPlatformInstructions(config?: CrmVocabConfig) {
  if (!config) {
    return BASE_PLATFORM_INSTRUCTIONS;
  }

  return `${BASE_PLATFORM_INSTRUCTIONS}\n\n${buildCrmVocabularyBlock(config)}`;
}

export const PLATFORM_INSTRUCTIONS = buildPlatformInstructions();
