/**
 * QA scenarios extracted from docs/qa/*.md — chat-testable prompts only.
 * @module scripts/qa/scenarios
 */

export interface QaScenario {
  surface: string;
  scenario: string;
  prompt: string;
  expectedTools: string[];
  sequential: boolean;
  notes: string;
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

  // ── 03: CRM Tools via Chat ─────────────────────────────────────────────
  {
    surface: "03-crm-tools",
    scenario: "demo-moment",
    prompt:
      "I just met Sarah Lim at 88 Tanjong Pagar. She's a buyer interested in the 2BR unit, price around $1.8M.",
    expectedTools: ["create_contact", "create_deal", "link_contact_to_deal"],
    sequential: false,
    notes: "Primary demo scenario. Agent creates contact + deal + link.",
  },
  {
    surface: "03-crm-tools",
    scenario: "create-contact",
    prompt:
      "Add a new contact — James Tan, seller, phone 9123-4567, email james@example.com",
    expectedTools: ["create_contact"],
    sequential: true,
    notes: "Contact creation with multiple fields.",
  },
  {
    surface: "03-crm-tools",
    scenario: "update-contact",
    prompt: "Update James Tan's phone to 9876-5432",
    expectedTools: ["search_contacts", "update_contact"],
    sequential: true,
    notes: "Depends on James Tan being created above.",
  },
  {
    surface: "03-crm-tools",
    scenario: "search-contacts-by-type",
    prompt: "Find all my buyer contacts",
    expectedTools: ["search_contacts"],
    sequential: true,
    notes: "Should return Sarah from demo moment.",
  },
  {
    surface: "03-crm-tools",
    scenario: "create-deal",
    prompt: "New deal at 42 Robertson Walk, asking $2.5M, stage is viewing",
    expectedTools: ["create_deal"],
    sequential: true,
    notes: "Standalone deal creation.",
  },
  {
    surface: "03-crm-tools",
    scenario: "update-deal-stage",
    prompt: "Move the Robertson Walk deal to negotiation stage",
    expectedTools: ["search_deals", "update_deal"],
    sequential: true,
    notes: "Depends on Robertson Walk deal.",
  },
  {
    surface: "03-crm-tools",
    scenario: "search-deals-by-stage",
    prompt: "Show me all deals in negotiation",
    expectedTools: ["search_deals"],
    sequential: true,
    notes: "Should return Robertson Walk deal.",
  },
  {
    surface: "03-crm-tools",
    scenario: "create-task-linked",
    prompt:
      "Remind me to follow up with Sarah Lim next Monday about the viewing",
    expectedTools: ["create_task"],
    sequential: true,
    notes: "Agent should link task to Sarah Lim contact.",
  },
  {
    surface: "03-crm-tools",
    scenario: "search-tasks",
    prompt: "What tasks do I have this week?",
    expectedTools: ["search_tasks"],
    sequential: true,
    notes: "Tests task filtering by date range.",
  },
  {
    surface: "03-crm-tools",
    scenario: "update-task-status",
    prompt: "Mark the Sarah follow-up task as done",
    expectedTools: ["search_tasks", "update_task"],
    sequential: true,
    notes: "Depends on task creation above.",
  },
  {
    surface: "03-crm-tools",
    scenario: "create-company",
    prompt:
      "Add a company — PropNex Realty, industry: real estate brokerage, website propnex.com",
    expectedTools: ["create_company"],
    sequential: true,
    notes: "Company creation.",
  },
  {
    surface: "03-crm-tools",
    scenario: "link-contact-to-company",
    prompt: "Link Sarah Lim to PropNex",
    expectedTools: [
      "search_contacts",
      "search_companies",
      "link_contact_to_company",
    ],
    sequential: true,
    notes: "Depends on Sarah and PropNex existing.",
  },
  {
    surface: "03-crm-tools",
    scenario: "create-interaction",
    prompt:
      "I just had a phone call with Sarah Lim about the Tanjong Pagar unit. She's very interested and wants to view this Saturday.",
    expectedTools: ["create_interaction"],
    sequential: true,
    notes: "Links interaction to Sarah + deal.",
  },
  {
    surface: "03-crm-tools",
    scenario: "search-interactions",
    prompt: "What were my last 3 interactions with Sarah?",
    expectedTools: ["search_interactions"],
    sequential: true,
    notes: "Depends on interaction above.",
  },
  {
    surface: "03-crm-tools",
    scenario: "describe-crm-schema",
    prompt: "How is my CRM configured?",
    expectedTools: ["describe_crm_schema"],
    sequential: false,
    notes: "Returns full CRM config.",
  },
  {
    surface: "03-crm-tools",
    scenario: "batch-create-companies",
    prompt: "Add these companies: ERA Realty, OrangeTee & Tie, Huttons Asia",
    expectedTools: ["batch_create_companies"],
    sequential: false,
    notes: "Batch company creation.",
  },

  // ── 05: Knowledge Base ─────────────────────────────────────────────────
  {
    surface: "05-knowledge-base",
    scenario: "list-documents",
    prompt: "What documents do I have in my knowledge base?",
    expectedTools: ["run_sql"],
    sequential: false,
    notes: "Agent queries vault_files.",
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
    notes: "Agent writes to memory/preferences.md.",
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
    notes: "Creates custom file.",
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
    notes: "Agent lists file tree.",
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
    scenario: "add-todo",
    prompt: "Add a todo: research comparable sales for District 10 condos",
    expectedTools: ["manage_todo"],
    sequential: false,
    notes: "Creates thread todo.",
  },
  {
    surface: "07-platform-intel",
    scenario: "add-multiple-todos",
    prompt:
      "Add two more todos: call the contractor about renovation, and prepare the property factsheet",
    expectedTools: ["manage_todo"],
    sequential: true,
    notes: "Batch todo creation.",
  },
  {
    surface: "07-platform-intel",
    scenario: "list-todos",
    prompt: "What are my todos for this thread?",
    expectedTools: ["manage_todo"],
    sequential: true,
    notes: "Lists all todos.",
  },
  {
    surface: "07-platform-intel",
    scenario: "complete-todo",
    prompt: "Done with the contractor call",
    expectedTools: ["manage_todo"],
    sequential: true,
    notes: "Marks todo as complete.",
  },

  // ── 08: Triggers & Automations ─────────────────────────────────────────
  {
    surface: "08-triggers",
    scenario: "create-schedule-trigger",
    prompt: "Check my overdue tasks every morning at 8am",
    expectedTools: ["setup_trigger"],
    sequential: false,
    notes: "Schedule trigger with cron expression.",
  },
  {
    surface: "08-triggers",
    scenario: "create-webhook-trigger",
    prompt: "Create a webhook trigger that processes inbound leads",
    expectedTools: ["setup_trigger"],
    sequential: false,
    notes: "Webhook trigger, returns URL.",
  },
  {
    surface: "08-triggers",
    scenario: "list-triggers",
    prompt: "List all my active triggers",
    expectedTools: ["manage_active_triggers"],
    sequential: false,
    notes: "Lists all active triggers.",
  },
  {
    surface: "08-triggers",
    scenario: "disable-trigger",
    prompt: "Disable the overdue tasks trigger",
    expectedTools: ["manage_active_triggers"],
    sequential: true,
    notes: "Disables a trigger.",
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
    notes: "Lists available integrations.",
  },

  // ── 11: Subagents ──────────────────────────────────────────────────────
  {
    surface: "11-subagents",
    scenario: "research-task",
    prompt:
      "Research the latest property market trends in Singapore Districts 9, 10, and 11 — cover prices, transaction volume, and notable launches for each",
    expectedTools: ["run_subagent"],
    sequential: false,
    notes: "Spawns subagent(s) for research. May be slow.",
  },
  {
    surface: "11-subagents",
    scenario: "parallel-research",
    prompt:
      "Compare property prices in Sentosa Cove vs Marina Bay — get current listings and recent transactions for both",
    expectedTools: ["run_subagent"],
    sequential: false,
    notes: "May spawn multiple subagents in parallel.",
  },

  // ── 12: Approvals ──────────────────────────────────────────────────────
  {
    surface: "12-approvals",
    scenario: "create-for-delete",
    prompt: "Create a contact named QA Test Delete",
    expectedTools: ["create_contact"],
    sequential: false,
    notes: "Setup for approval gate test.",
  },
  {
    surface: "12-approvals",
    scenario: "delete-triggers-gate",
    prompt: "Delete the contact QA Test Delete",
    expectedTools: ["delete_contact"],
    sequential: true,
    notes:
      "Approval card should appear. Runner cannot approve — just verify the gate fires.",
  },
  {
    surface: "12-approvals",
    scenario: "non-destructive-bypasses-gate",
    prompt: "Create a contact named QA No Gate",
    expectedTools: ["create_contact"],
    sequential: false,
    notes: "Creates should auto-execute without approval.",
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
  },
  {
    surface: "17-calculate",
    scenario: "multi-step-calc",
    prompt:
      "I'm selling a condo for $2.5M. Commission is 2%. GST is 9% on commission. What's the net commission after GST?",
    expectedTools: ["calculate"],
    sequential: false,
    notes: "Chained calculation.",
  },
  {
    surface: "17-calculate",
    scenario: "unit-conversion",
    prompt: "Convert 1500 square feet to square meters",
    expectedTools: ["calculate"],
    sequential: false,
    notes: "Unit conversion.",
  },
  {
    surface: "17-calculate",
    scenario: "compound-growth",
    prompt:
      "If a $1M property appreciates at 3% per year for 5 years, what's the final value?",
    expectedTools: ["calculate"],
    sequential: false,
    notes: "Compound growth.",
  },
  {
    surface: "17-calculate",
    scenario: "stamp-duty",
    prompt:
      "Property price is $800,000. Stamp duty is 3% on the first $180K and 4% above that. Calculate stamp duty.",
    expectedTools: ["calculate"],
    sequential: false,
    notes: "Named variables.",
  },

  // ── 18: Agent Views ────────────────────────────────────────────────────
  {
    surface: "18-agent-views",
    scenario: "deals-pipeline",
    prompt: "Show me my deals pipeline",
    expectedTools: ["search_deals"],
    sequential: false,
    notes: "Inline pipeline view via ```spec fence (inline mode, no tool call).",
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
    expectedTools: ["search_deals"],
    sequential: false,
    notes: "BarChartPanel via inline spec.",
  },
  {
    surface: "18-agent-views",
    scenario: "contact-donut-chart",
    prompt: "Show me my contact types as a pie chart",
    expectedTools: ["search_contacts"],
    sequential: false,
    notes: "DonutChartPanel via inline spec.",
  },
  {
    surface: "18-agent-views",
    scenario: "overdue-tasks",
    prompt: "Show me my overdue tasks",
    expectedTools: ["search_tasks"],
    sequential: false,
    notes: "TaskItem components via inline spec.",
  },
];
