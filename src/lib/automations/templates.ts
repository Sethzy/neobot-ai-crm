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
  {
    id: "morning-crm-briefing",
    title: "Morning CRM briefing",
    description: "Daily summary of your pipeline, overdue tasks, and today's follow-ups.",
    category: "sales",
    prompt:
      "Set up a daily morning briefing automation. Every weekday at 8 AM, review my CRM pipeline: summarize any overdue tasks, deals that need attention, and contacts I should follow up with today. Write the briefing to this thread.",
  },
  {
    id: "listing-alert-monitor",
    title: "New listing monitor",
    description: "Watch RSS feeds for new property listings matching your criteria.",
    category: "research",
    prompt:
      "Set up an RSS monitor for new property listings. I want to track new listings from PropertyGuru and 99.co. When new listings appear, summarize the key details (price, location, size, PSF) and flag anything that matches my active buyer requirements in the CRM.",
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
    id: "competitor-monitoring",
    title: "Market news digest",
    description: "Weekly roundup of real estate market news and competitor activity.",
    category: "research",
    prompt:
      "Set up a weekly market intelligence automation. Every Monday morning, search for recent Singapore real estate market news, new launches, policy changes, and notable transactions. Compile a brief digest I can reference during client conversations.",
  },
  {
    id: "birthday-anniversary-reminder",
    title: "Birthday & anniversary reminders",
    description: "Never miss a client's birthday or transaction anniversary.",
    category: "operations",
    prompt:
      "Set up a daily automation that checks my CRM contacts for upcoming birthdays and transaction anniversaries in the next 7 days. For each one, draft a personalized greeting message I can send.",
  },
];
