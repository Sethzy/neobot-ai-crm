/**
 * Static catalog of suggested automation templates.
 * Each template is a pre-filled chat prompt the agent executes conversationally.
 * @module lib/automations/templates
 */

/** Shape of a suggested automation template. */
export interface AutomationTemplate {
  /** Unique identifier. */
  id: string;
  /** Short display title for the card. */
  title: string;
  /** One-line description shown below the title. */
  description: string;
  /** Grouping category for filtering/display. */
  category: "sales" | "operations" | "research" | "marketing";
  /** The full prompt text pre-filled into the chat composer. */
  prompt: string;
}

/** Pre-built automation templates for real estate agents. */
export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  // --- Sales ---
  {
    id: "morning-crm-briefing",
    title: "Morning CRM briefing",
    description: "Daily summary of your pipeline, overdue tasks, and today's follow-ups.",
    category: "sales",
    prompt:
      "Set up a daily morning briefing automation. Every weekday at 8 AM, review my CRM pipeline: summarize any overdue tasks, deals that need attention, and contacts I should follow up with today. Write the briefing to this thread.",
  },
  {
    id: "follow-up-reminder-sweep",
    title: "Follow-up reminder sweep",
    description: "Check for contacts that haven't been reached in 7+ days.",
    category: "sales",
    prompt:
      "Set up a daily follow-up reminder automation. Every weekday at 9 AM, search my CRM for contacts that haven't had any interaction in the last 7 days. For each one, draft a personalized follow-up message I can review and send.",
  },
  {
    id: "weekly-pipeline-summary",
    title: "Weekly pipeline summary",
    description: "End-of-week recap of deals, wins, and what needs attention next week.",
    category: "sales",
    prompt:
      "Set up a weekly pipeline summary automation. Every Friday at 4 PM, compile a summary of my deal pipeline: new deals this week, deals that moved stages, any deals at risk, and recommended priorities for next week.",
  },
  {
    id: "post-viewing-follow-up",
    title: "Post-viewing follow-up drafter",
    description: "Draft follow-up messages after property viewings.",
    category: "sales",
    prompt:
      "Set up a daily automation that checks for any property viewings I had yesterday (look for viewing-related tasks or calendar events in the CRM). For each viewing, draft a personalized follow-up message to the client thanking them and asking about their interest level.",
  },
  {
    id: "hot-lead-alert",
    title: "Hot lead alerts",
    description: "Get notified when a contact shows high-intent buying signals.",
    category: "sales",
    prompt:
      "Set up an alert automation. Monitor my CRM for contacts who have multiple recent interactions, viewing requests, or deal stage changes within a short window. Flag them as hot leads and send me a summary with recommended next actions.",
  },
  {
    id: "deal-stagnation-check",
    title: "Deal stagnation checker",
    description: "Flag deals that haven't moved stages in 14+ days.",
    category: "sales",
    prompt:
      "Set up a weekly automation that checks for deals stuck in the same pipeline stage for more than 14 days. For each stagnant deal, suggest actions I can take to move it forward.",
  },
  // --- Operations ---
  {
    id: "birthday-anniversary-reminder",
    title: "Birthday & anniversary reminders",
    description: "Never miss a client's birthday or transaction anniversary.",
    category: "operations",
    prompt:
      "Set up a daily automation that checks my CRM contacts for upcoming birthdays and transaction anniversaries in the next 7 days. For each one, draft a personalized greeting message I can send.",
  },
  {
    id: "document-organizer",
    title: "Document organizer",
    description: "Keep your client files tidy with auto-sorting into folders.",
    category: "operations",
    prompt:
      "Help me organize my workspace files. Review the current file structure in my workspace, then create a clean folder hierarchy by client and deal stage. Move any misplaced documents into the correct locations.",
  },
  {
    id: "commission-tracker",
    title: "Commission tracker",
    description: "Weekly summary of expected commissions from your active deals.",
    category: "operations",
    prompt:
      "Set up a weekly automation that calculates estimated commissions from all my active deals. Break it down by deal stage, expected close date, and probability. Give me a total forecast for this month and next.",
  },
  // --- Research ---
  {
    id: "listing-alert-monitor",
    title: "New listing monitor",
    description: "Watch RSS feeds for new property listings matching your criteria.",
    category: "research",
    prompt:
      "Set up an RSS monitor for new property listings. I want to track new listings from PropertyGuru and 99.co. When new listings appear, summarize the key details (price, location, size, PSF) and flag anything that matches my active buyer requirements in the CRM.",
  },
  {
    id: "competitor-monitoring",
    title: "Market news digest",
    description: "Weekly roundup of real estate market news and competitor activity.",
    category: "research",
    prompt:
      "Set up a weekly market intelligence automation. Every Monday morning, search for recent Singapore real estate market news, new launches, policy changes, and notable transactions. Compile a brief digest I can reference during client conversations.",
  },
  {
    id: "comparable-sales-analysis",
    title: "Comparable sales analysis",
    description: "Research recent transacted prices for a property or district.",
    category: "research",
    prompt:
      "Help me run a comparable sales analysis. I'll give you a property address or district, and you search for recent transactions in the area. Compile a summary of transacted prices, PSF trends, and how they compare to the current asking price.",
  },
  // --- Marketing ---
  {
    id: "social-media-drafter",
    title: "Social media post drafter",
    description: "Draft property listing posts for your social media channels.",
    category: "marketing",
    prompt:
      "Help me draft social media posts for my latest property listings. For each listing, create engaging copy suitable for Instagram and Facebook, highlighting key selling points, nearby amenities, and a call to action.",
  },
  {
    id: "client-testimonial-collector",
    title: "Client testimonial collector",
    description: "Draft follow-up messages to collect testimonials after closings.",
    category: "marketing",
    prompt:
      "Set up an automation that checks for recently closed deals. For each closing, draft a warm follow-up message asking the client for a testimonial or Google review. Make it personal and reference details from their transaction.",
  },
  {
    id: "area-expert-content",
    title: "Area expert content",
    description: "Generate neighborhood guides to establish local expertise.",
    category: "marketing",
    prompt:
      "Help me create a neighborhood guide for a specific area. Research the district's amenities, schools, transport links, recent developments, and price trends. Format it as a shareable guide I can use in my marketing.",
  },
];
