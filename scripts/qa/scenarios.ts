/**
 * QA scenarios — chat-testable prompts aligned to v2 tool inventory.
 * @see docs/product/tooling/agent-tools-inventory-v2.md
 * @module scripts/qa/scenarios
 */

export interface QaScenario {
  surface: string;
  scenario: string;
  prompt: string;
  expectedTools: string[];
  sequential: boolean;
  notes: string;
  /** Override default token budget (based on tool count). */
  tokenBudget?: number;
  /** Override default latency budget in ms (based on tool count). */
  latencyBudgetMs?: number;
  /** Regex pattern to match against the agent's text response. */
  expectedOutput?: string;
  /** When true, the runner activates CRM config mode before sending the prompt. */
  activateCrmConfigMode?: boolean;
}

/**
 * Default token budget based on expected tool count.
 * Accounts for ~12K base context (system prompt + CRM vocabulary + memory).
 * Each tool step roughly doubles the context (resends everything).
 */
export function getDefaultTokenBudget(expectedTools: string[]): number {
  if (expectedTools.length === 0) return 15_000;
  if (expectedTools.length === 1) return 40_000;
  if (expectedTools.length <= 3) return 80_000;
  return 120_000;
}

/** Default latency budget in ms based on expected tool count. */
export function getDefaultLatencyBudgetMs(expectedTools: string[]): number {
  if (expectedTools.length === 0) return 10_000;
  if (expectedTools.length === 1) return 15_000;
  if (expectedTools.length <= 3) return 25_000;
  return 40_000;
}

/**
 * Each scenario group shares a single thread. Sequential scenarios within a
 * group reuse the thread; non-sequential ones can start fresh threads.
 *
 * We group by surface + contiguous sequential chains so the runner can decide
 * how many threads to create.
 */
export const scenarios: QaScenario[] = [
  // ── 02: Chat Core ──────────────────────────────────────────────────────
  {
    surface: "02-chat-core",
    scenario: "basic-conversation",
    prompt: "Hello, what can you help me with?",
    expectedTools: [],
    sequential: false,
    notes: "First message. Agent streams a response and auto-titles thread.",
  },
  {
    surface: "02-chat-core",
    scenario: "follow-up-context",
    prompt: "Tell me more about CRM features",
    expectedTools: [],
    sequential: true,
    notes: "Same thread. Should demonstrate conversation continuity.",
  },
  {
    surface: "02-chat-core",
    scenario: "rename-thread",
    prompt: "Rename this chat to 'Q1 Deal Pipeline Review'",
    expectedTools: ["rename_chat"],
    sequential: true,
    notes: "Agent calls rename_chat with the user's exact title.",
  },

  // ── 03: CRM Tools via Chat ─────────────────────────────────────────────
  {
    surface: "03-crm-tools",
    scenario: "demo-moment",
    prompt:
      "I just met Sarah Lim at 88 Tanjong Pagar. She's a buyer interested in the 2BR unit, price around $1.8M.",
    expectedTools: ["create_record", "link_records"],
    sequential: false,
    notes:
      "Primary demo scenario. Agent calls create_record twice (contact + deal), then link_records. expectedTools is deduplicated.",
  },
  {
    surface: "03-crm-tools",
    scenario: "create-contact",
    prompt:
      "Add a new contact — James Tan, seller, phone 9123-4567, email james@example.com",
    expectedTools: ["create_record"],
    sequential: true,
    notes: "Contact creation via create_record with entity: contacts.",
  },
  {
    surface: "03-crm-tools",
    scenario: "update-contact",
    prompt: "Update James Tan's phone to 9876-5432",
    expectedTools: ["search_crm", "update_record"],
    sequential: true,
    notes:
      "Agent searches via search_crm to find contact_id, then updates via update_record.",
  },
  {
    surface: "03-crm-tools",
    scenario: "search-contacts-by-type",
    prompt: "Find all my buyer contacts",
    expectedTools: ["search_crm"],
    sequential: true,
    notes:
      "search_crm with entity: contacts, filters: {type: buyer}. Should return Sarah from demo moment.",
  },
  {
    surface: "03-crm-tools",
    scenario: "create-deal",
    prompt: "New deal at 42 Robertson Walk, asking $2.5M, stage is viewing",
    expectedTools: ["create_record"],
    sequential: true,
    notes: "Deal creation via create_record with entity: deals.",
  },
  {
    surface: "03-crm-tools",
    scenario: "update-deal-stage",
    prompt: "Move the Robertson Walk deal to negotiation stage",
    expectedTools: ["search_crm", "update_record"],
    sequential: true,
    notes:
      "Agent searches via search_crm, updates via update_record. May trigger deal_stage_changed analytics.",
  },
  {
    surface: "03-crm-tools",
    scenario: "search-deals-by-stage",
    prompt: "Show me all deals in negotiation",
    expectedTools: ["search_crm"],
    sequential: true,
    notes:
      "search_crm with entity: deals, filters: {stage: negotiation}. Should return Robertson Walk deal.",
  },
  {
    surface: "03-crm-tools",
    scenario: "create-task-linked",
    prompt:
      "Remind me to follow up with Sarah Lim next Monday about the viewing",
    expectedTools: ["create_task"],
    sequential: true,
    notes:
      "create_task with title, due_date, contact_id. Agent may also call search_crm to find Sarah's ID (acceptable extra).",
  },
  {
    surface: "03-crm-tools",
    scenario: "search-tasks",
    prompt: "What tasks do I have this week?",
    expectedTools: ["search_crm"],
    sequential: true,
    notes:
      "search_crm with entity: tasks. run_sql is also acceptable for date-range task queries.",
  },
  {
    surface: "03-crm-tools",
    scenario: "update-task-status",
    prompt: "Mark the Sarah follow-up task as done",
    expectedTools: ["search_crm", "update_task"],
    sequential: true,
    notes:
      "Agent searches via search_crm to find task_id, then update_task with status: completed.",
  },
  {
    surface: "03-crm-tools",
    scenario: "create-company",
    prompt:
      "Add a company — PropNex Realty, industry: real estate brokerage, website propnex.com",
    expectedTools: ["create_record"],
    sequential: true,
    notes: "Company creation via create_record with entity: companies.",
  },
  {
    surface: "03-crm-tools",
    scenario: "link-contact-to-company",
    prompt: "Link Sarah Lim to PropNex",
    expectedTools: ["search_crm", "link_records"],
    sequential: true,
    notes:
      "Agent calls search_crm (may call once or twice for contact + company), then link_records with relationship: contact_company.",
  },
  {
    surface: "03-crm-tools",
    scenario: "create-interaction",
    prompt:
      "I just had a phone call with Sarah Lim about the Tanjong Pagar unit. She's very interested and wants to view this Saturday.",
    expectedTools: ["create_interaction"],
    sequential: true,
    notes:
      "create_interaction with contact_id, type (from config), summary. Agent may search_crm first (acceptable extra).",
  },
  {
    surface: "03-crm-tools",
    scenario: "search-interactions",
    prompt: "What were my last 3 interactions with Sarah?",
    expectedTools: ["search_crm"],
    sequential: true,
    notes:
      "search_crm with entity: interactions. Depends on interaction above.",
  },
  {
    surface: "03-crm-tools",
    scenario: "crm-config-from-context",
    prompt: "How is my CRM configured?",
    expectedTools: [],
    sequential: false,
    notes:
      "CRM schema is injected passively via <crm-vocabulary> in system-reminder. Agent answers from context, no tool call needed.",
    expectedOutput: "stage|lead|viewing|negotiation|contact|deal",
  },
  {
    surface: "03-crm-tools",
    scenario: "batch-create-companies",
    prompt: "Add these companies: ERA Realty, OrangeTee & Tie, Huttons Asia",
    expectedTools: ["create_record"],
    sequential: false,
    notes:
      "Batch creation via create_record with entity: companies, records array (up to 50). Built-in duplicate detection.",
  },

  // ── 03: CRM Edge Cases ────────────────────────────────────────────────
  {
    surface: "03-crm-tools",
    scenario: "duplicate-detection",
    prompt:
      "Add a contact named Sarah Lim, phone 9999-0000",
    expectedTools: ["create_record"],
    sequential: true,
    notes:
      "Sequential after demo-moment. create_record should return possible_duplicates (Sarah Lim already exists). Agent should ask user before forcing.",
  },
  {
    surface: "03-crm-tools",
    scenario: "force-create-duplicate",
    prompt: "Yes, create her anyway even if she's a duplicate",
    expectedTools: ["create_record"],
    sequential: true,
    notes:
      "Tests force_create: true override. Agent re-calls create_record with force_create flag.",
  },
  {
    surface: "03-crm-tools",
    scenario: "batch-create-contacts",
    prompt:
      "Add these contacts: Alice Tan (buyer), Bob Lee (seller), Charlie Ng (landlord)",
    expectedTools: ["create_record"],
    sequential: false,
    notes:
      "Batch creation via create_record with entity: contacts, records array of 3. Built-in intra-batch duplicate detection.",
  },
  {
    surface: "03-crm-tools",
    scenario: "custom-field-merge",
    prompt:
      "Update the Robertson Walk deal — add a custom field 'renovation_status' with value 'pending'",
    expectedTools: ["search_crm", "update_record"],
    sequential: true,
    notes:
      "Sequential after create-deal. update_record with custom_fields deep merge — preserves existing keys not in patch.",
  },
  {
    surface: "03-crm-tools",
    scenario: "unlink-records",
    prompt: "Remove Sarah Lim from the Tanjong Pagar deal",
    expectedTools: ["search_crm", "link_records"],
    sequential: true,
    notes:
      "link_records with action: unlink, relationship: contact_deal. Junction table delete (not FK null).",
  },
  {
    surface: "03-crm-tools",
    scenario: "configure-crm-stages",
    prompt:
      "Change my deal stages to: prospecting, quoted, negotiation, closed-won, closed-lost",
    expectedTools: ["configure_crm"],
    sequential: false,
    activateCrmConfigMode: true,
    notes:
      "configure_crm updates deal_stages in crm_config. Requires CRM config mode to be active (PR 48).",
  },

  // ── 05: Knowledge Base ─────────────────────────────────────────────────
  {
    surface: "05-knowledge-base",
    scenario: "list-documents",
    prompt: "What documents do I have in my knowledge base?",
    expectedTools: ["run_sql"],
    sequential: false,
    notes:
      "Agent queries vault_files. read_file (directory listing on /agent/vault/) is also acceptable.",
  },
  {
    surface: "05-knowledge-base",
    scenario: "search-kb-keyword",
    prompt: "Search my knowledge base for anything about stamp duty",
    expectedTools: ["search_knowledge"],
    sequential: false,
    notes:
      "search_knowledge uses Postgres full-text search on vault_files. Returns up to 5 matching filenames and summaries.",
  },

  // ── 06: File & Memory ──────────────────────────────────────────────────
  {
    surface: "06-file-memory",
    scenario: "read-soul-md",
    prompt: "What's in my SOUL.md?",
    expectedTools: ["read_file"],
    sequential: false,
    notes: "Agent reads SOUL.md.",
  },
  {
    surface: "06-file-memory",
    scenario: "write-preference",
    prompt:
      "I always prefer to communicate via WhatsApp, not email. Remember that.",
    expectedTools: ["write_file"],
    sequential: false,
    notes:
      "Agent writes to memory file (op: write or edit). Triggers memory write analytics event.",
  },
  {
    surface: "06-file-memory",
    scenario: "write-user-profile",
    prompt:
      "My name is Wei Ming, I work at PropNex, I specialize in District 9 and 10 condos.",
    expectedTools: ["write_file"],
    sequential: false,
    notes: "Agent writes to USER.md.",
  },
  {
    surface: "06-file-memory",
    scenario: "write-custom-file",
    prompt:
      "Write a note called 'showing-prep.md' with a checklist for preparing a property showing",
    expectedTools: ["write_file"],
    sequential: false,
    notes: "Creates custom file via write_file with op: write.",
  },
  {
    surface: "06-file-memory",
    scenario: "read-custom-file",
    prompt: "Read back the showing-prep.md file",
    expectedTools: ["read_file"],
    sequential: true,
    notes: "Depends on showing-prep.md being written above.",
  },
  {
    surface: "06-file-memory",
    scenario: "list-files",
    prompt: "What files do I have?",
    expectedTools: ["read_file"],
    sequential: false,
    notes:
      "read_file on a directory path returns recursive tree-style listing.",
  },

  // ── 07: Platform Intelligence ──────────────────────────────────────────
  {
    surface: "07-platform-intel",
    scenario: "knows-time",
    prompt: "What time is it?",
    expectedTools: [],
    sequential: false,
    notes: "Agent should know time from system-reminder.",
  },
  {
    surface: "07-platform-intel",
    scenario: "knows-user-name",
    prompt: "What's my name?",
    expectedTools: [],
    sequential: false,
    notes: "Agent should know display_name.",
  },
  {
    surface: "07-platform-intel",
    scenario: "sql-count-contacts",
    prompt: "How many contacts do I have in total?",
    expectedTools: ["run_sql"],
    sequential: false,
    notes: "COUNT query on contacts.",
  },
  {
    surface: "07-platform-intel",
    scenario: "sql-sum-deals",
    prompt: "What's the total value of all my deals?",
    expectedTools: ["run_sql"],
    sequential: false,
    notes: "SUM query on deals.",
  },
  {
    surface: "07-platform-intel",
    scenario: "sql-deals-closed-this-month",
    prompt: "How many deals closed this month?",
    expectedTools: ["run_sql"],
    sequential: false,
    notes: "Date-filtered query.",
  },
  {
    surface: "07-platform-intel",
    scenario: "sql-contacts-without-deals",
    prompt: "Show me contacts who don't have any deals",
    expectedTools: ["run_sql"],
    sequential: false,
    notes: "LEFT JOIN / NOT EXISTS.",
  },
  {
    surface: "07-platform-intel",
    scenario: "get-db-schema",
    prompt: "What tables can you query?",
    expectedTools: ["get_agent_db_schema"],
    sequential: false,
    notes: "Lists available tables.",
  },
  {
    surface: "07-platform-intel",
    scenario: "web-search-property",
    prompt:
      "Search for the latest URA property transaction data for District 9",
    expectedTools: ["web_search"],
    sequential: false,
    notes:
      "web_search via Brave Search API. Returns titles, URLs, snippets. May use location: SG.",
  },
  {
    surface: "07-platform-intel",
    scenario: "web-scrape-page",
    prompt:
      "Read this page for me: https://www.ura.gov.sg/property-market-information/pmiResidentialTransactionSearch",
    expectedTools: ["web_scrape"],
    sequential: false,
    notes:
      "web_scrape via Exa API. Extracts markdown content, capped at 10K chars.",
  },
  {
    surface: "07-platform-intel",
    scenario: "drive-time",
    prompt:
      "How long to drive from Orchard Road to Changi Airport right now?",
    expectedTools: ["calculate_drive_time"],
    sequential: false,
    notes:
      "calculate_drive_time via Google Maps Routes API. Returns duration_minutes, distance_km, traffic-aware.",
  },
  {
    surface: "07-platform-intel",
    scenario: "add-todo",
    prompt: "Add a todo: research comparable sales for District 10 condos",
    expectedTools: ["manage_todo"],
    sequential: false,
    notes: "manage_todo with op: add.",
  },
  {
    surface: "07-platform-intel",
    scenario: "add-multiple-todos",
    prompt:
      "Add two more todos: call the contractor about renovation, and prepare the property factsheet",
    expectedTools: ["manage_todo"],
    sequential: true,
    notes:
      "Batch todo creation. manage_todo supports 1-20 operations per call.",
  },
  {
    surface: "07-platform-intel",
    scenario: "list-todos",
    prompt: "What are my todos for this thread?",
    expectedTools: ["list_todo"],
    sequential: true,
    notes:
      "list_todo (separate from manage_todo in v2). Returns all todos for the thread.",
  },
  {
    surface: "07-platform-intel",
    scenario: "complete-todo",
    prompt: "Done with the contractor call",
    expectedTools: ["manage_todo"],
    sequential: true,
    notes: "manage_todo with op: delete to mark as done.",
  },

  {
    surface: "07-platform-intel",
    scenario: "agent-asks-question",
    prompt:
      "I want to set up my CRM but I'm not sure what stages make sense for my business",
    expectedTools: ["ask_user_question"],
    sequential: false,
    notes:
      "ask_user_question presents 2-4 structured options. Agent should ask clarifying question about industry/workflow.",
  },

  // ── 08: Triggers & Automations ─────────────────────────────────────────
  {
    surface: "08-triggers",
    scenario: "search-trigger-types",
    prompt: "What kinds of triggers can I set up?",
    expectedTools: ["search_triggers"],
    sequential: false,
    notes:
      "search_triggers searches the trigger catalog (schedule, webhook, rss). Returns setup schemas.",
  },
  {
    surface: "08-triggers",
    scenario: "create-schedule-trigger",
    prompt: "Check my overdue tasks every morning at 8am",
    expectedTools: ["setup_trigger"],
    sequential: false,
    notes:
      "setup_trigger with trigger_id: schedule, params with cron expression. Agent may call search_triggers first (acceptable extra).",
  },
  {
    surface: "08-triggers",
    scenario: "create-webhook-trigger",
    prompt: "Create a webhook trigger that processes inbound leads",
    expectedTools: ["setup_trigger"],
    sequential: false,
    notes: "Webhook trigger. Returns webhook_url in response.",
  },
  {
    surface: "08-triggers",
    scenario: "list-triggers",
    prompt: "List all my active triggers",
    expectedTools: ["manage_active_triggers"],
    sequential: false,
    notes: "manage_active_triggers with action: list.",
  },
  {
    surface: "08-triggers",
    scenario: "disable-trigger",
    prompt: "Delete the overdue tasks trigger",
    expectedTools: ["manage_active_triggers"],
    sequential: true,
    notes:
      "manage_active_triggers with action: delete. Approval-gated (delete only).",
  },

  // ── 10: Connections ────────────────────────────────────────────────────
  {
    surface: "10-connections",
    scenario: "list-connections",
    prompt: "What services am I connected to?",
    expectedTools: ["list_users_connections"],
    sequential: false,
    notes: "May return empty list.",
  },
  {
    surface: "10-connections",
    scenario: "search-integrations",
    prompt: "What integrations can I connect?",
    expectedTools: ["search_for_integrations"],
    sequential: false,
    notes:
      "Searches Composio catalog (3000+ integrations). Returns integrationId, name, description.",
  },
  {
    surface: "10-connections",
    scenario: "integration-capabilities",
    prompt: "What can the Google Calendar integration do?",
    expectedTools: ["get_integrations_capabilities"],
    sequential: false,
    notes:
      "get_integrations_capabilities returns tools, quality scores, and notes for given integrationIds. Agent may call search_for_integrations first (acceptable extra).",
  },

  // ── 11: Subagents ──────────────────────────────────────────────────────
  {
    surface: "11-subagents",
    scenario: "research-task",
    prompt:
      "Research the latest property market trends in Singapore Districts 9, 10, and 11 — cover prices, transaction volume, and notable launches for each",
    expectedTools: ["run_subagent"],
    sequential: false,
    notes:
      "Spawns subagent(s) for research. Subagent has 9-step limit, 120s timeout. May be slow.",
    latencyBudgetMs: 120_000,
    tokenBudget: 80_000,
  },
  {
    surface: "11-subagents",
    scenario: "parallel-research",
    prompt:
      "Compare property prices in Sentosa Cove vs Marina Bay — get current listings and recent transactions for both",
    expectedTools: ["run_subagent"],
    sequential: false,
    notes: "May spawn multiple subagents in parallel.",
    latencyBudgetMs: 120_000,
    tokenBudget: 80_000,
  },

  // ── 12: Approvals ──────────────────────────────────────────────────────
  {
    surface: "12-approvals",
    scenario: "create-for-delete",
    prompt: "Create a contact named QA Test Delete",
    expectedTools: ["create_record"],
    sequential: false,
    notes: "Setup for approval gate test. create_record with entity: contacts.",
  },
  {
    surface: "12-approvals",
    scenario: "delete-triggers-gate",
    prompt: "Delete the contact QA Test Delete",
    expectedTools: ["delete_records"],
    sequential: true,
    notes:
      "delete_records requires entity, ids, and reason. Approval gate fires (needsApproval: true). Runner cannot approve — just verify the gate fires.",
  },
  {
    surface: "12-approvals",
    scenario: "non-destructive-bypasses-gate",
    prompt: "Create a contact named QA No Gate",
    expectedTools: ["create_record"],
    sequential: false,
    notes:
      "create_record has no approval gate. Should auto-execute without approval.",
  },

  {
    surface: "12-approvals",
    scenario: "approval-denied-retry",
    prompt: "Actually yes, go ahead and delete QA Test Keep",
    expectedTools: ["search_crm", "delete_records"],
    sequential: true,
    notes:
      "Sequential after non-destructive-bypasses-gate (creates QA Test Keep). Tests that a new approval card appears after prior denial. Runner can't approve — just verify gate fires again.",
  },

  // ── 17: Calculate Tool ─────────────────────────────────────────────────
  {
    surface: "17-calculate",
    scenario: "commission-calc",
    prompt:
      "What is 1% commission on a $1.8M property sale with 60/40 co-broke split?",
    expectedTools: ["calculate"],
    sequential: false,
    notes: "Basic commission calculation.",
    expectedOutput: "10[,.]?800",
  },
  {
    surface: "17-calculate",
    scenario: "multi-step-calc",
    prompt:
      "I'm selling a condo for $2.5M. Commission is 2%. GST is 9% on commission. What's the net commission after GST?",
    expectedTools: ["calculate"],
    sequential: false,
    notes: "Chained calculation. May call calculate multiple times.",
  },
  {
    surface: "17-calculate",
    scenario: "unit-conversion",
    prompt: "Convert 1500 square feet to square meters",
    expectedTools: ["calculate"],
    sequential: false,
    notes: "Unit conversion via math.js (e.g., '1500 sqft to m^2').",
    expectedOutput: "139\\.\\d",
  },
  {
    surface: "17-calculate",
    scenario: "compound-growth",
    prompt:
      "If a $1M property appreciates at 3% per year for 5 years, what's the final value?",
    expectedTools: ["calculate"],
    sequential: false,
    notes: "Compound growth. May use variables parameter.",
    expectedOutput: "1[,.]?159[,.]?274",
  },
  {
    surface: "17-calculate",
    scenario: "stamp-duty",
    prompt:
      "Property price is $800,000. Stamp duty is 3% on the first $180K and 4% above that. Calculate stamp duty.",
    expectedTools: ["calculate"],
    sequential: false,
    notes:
      "May use variables parameter or decompose into multiple calculate calls.",
    expectedOutput: "30[,.]?200",
  },

  // ── 18: Agent Views ────────────────────────────────────────────────────
  {
    surface: "18-agent-views",
    scenario: "deals-pipeline",
    prompt: "Show me my deals pipeline",
    expectedTools: ["search_crm"],
    sequential: false,
    notes:
      "search_crm with entity: deals. Inline pipeline view via ```spec fence.",
  },
  {
    surface: "18-agent-views",
    scenario: "crm-summary",
    prompt:
      "Give me a quick summary of my CRM — how many contacts, deals, and tasks do I have?",
    expectedTools: ["run_sql"],
    sequential: false,
    notes: "StatMetric components via inline spec.",
  },
  {
    surface: "18-agent-views",
    scenario: "deals-bar-chart",
    prompt: "Show me a breakdown of my deals by stage as a bar chart",
    expectedTools: ["search_crm"],
    sequential: false,
    notes:
      "search_crm with entity: deals. BarChartPanel via inline spec. run_sql also acceptable.",
  },
  {
    surface: "18-agent-views",
    scenario: "contact-donut-chart",
    prompt: "Show me my contact types as a pie chart",
    expectedTools: ["search_crm"],
    sequential: false,
    notes:
      "search_crm with entity: contacts. DonutChartPanel via inline spec. run_sql also acceptable.",
  },
  {
    surface: "18-agent-views",
    scenario: "overdue-tasks",
    prompt: "Show me my overdue tasks",
    expectedTools: ["search_crm"],
    sequential: false,
    notes:
      "search_crm with entity: tasks. TaskItem components via inline spec. run_sql also acceptable.",
  },

  // ---------------------------------------------------------------------------
  // Surface 25: Instruction Skills
  // ---------------------------------------------------------------------------
  {
    surface: "25-instruction-skills",
    scenario: "daily-briefing-trigger",
    prompt: "What's on my plate today?",
    expectedTools: ["read_file", "search_crm"],
    sequential: false,
    notes:
      "Agent should load daily-briefing skill via read_file(/agent/skills/daily-briefing/SKILL.md), then follow workflow with search_crm for tasks/deals.",
  },
  {
    surface: "25-instruction-skills",
    scenario: "call-prep-trigger",
    prompt: "Prep me for my call with David Tan",
    expectedTools: ["read_file", "search_crm"],
    sequential: false,
    notes:
      "Agent should load call-prep skill via read_file(/agent/skills/call-prep/SKILL.md), then search_crm for David Tan's history. web_search also acceptable.",
  },
  {
    surface: "25-instruction-skills",
    scenario: "draft-outreach-trigger",
    prompt: "Draft an outreach message to Sarah Lim about the insurance renewal",
    expectedTools: ["read_file", "search_crm"],
    sequential: false,
    notes:
      "Agent should load draft-outreach skill via read_file(/agent/skills/draft-outreach/SKILL.md), then search_crm for Sarah Lim. web_search also acceptable.",
  },
  {
    surface: "25-instruction-skills",
    scenario: "no-skill-trigger",
    prompt: "What's the weather in Singapore?",
    expectedTools: ["web_search"],
    sequential: false,
    notes:
      "Agent should NOT load any skill — no read_file on /agent/skills/. Should answer via web_search or general knowledge.",
  },
  {
    surface: "25-instruction-skills",
    scenario: "create-custom-skill",
    prompt:
      "Save a skill for me: whenever I close a deal, update the CRM to closed-won and remind me to ask for a Google review in 2 weeks.",
    expectedTools: ["write_file"],
    sequential: false,
    notes:
      "Agent should call write_file to create a new SKILL.md under /agent/skills/{slug}/. File should have valid YAML frontmatter with name and description.",
  },

  // ── 26: Ask User Question Widget ──────────────────────────────────────
  {
    surface: "26-ask-user-question",
    scenario: "structured-clarification",
    prompt:
      "I want to send a newsletter to my warm leads but I'm not sure about the angle",
    expectedTools: ["ask_user_question"],
    sequential: false,
    notes:
      "Agent should call ask_user_question with structured options (not ask in prose). Verify tool output has question, options (string[]), and type field.",
  },
  {
    surface: "26-ask-user-question",
    scenario: "batched-multi-question",
    prompt:
      "I need help writing a market update report — ask me some clarifying questions before you start",
    expectedTools: ["ask_user_question"],
    sequential: false,
    notes:
      "Agent should batch 2-3 questions into a single ask_user_question call (questions array length > 1). Verify the tool is called once with multiple questions, not multiple times with one question each.",
  },
  {
    surface: "26-ask-user-question",
    scenario: "prefers-multi-select",
    prompt:
      "What should I include in my client brief for the Tans?",
    expectedTools: ["ask_user_question"],
    sequential: false,
    notes:
      "Agent should prefer multi_select type for this question (multiple sections could be included). Verify type field is 'multi_select', not 'single_select'. // TODO: verify expectedTools — agent may search CRM first.",
  },
];
