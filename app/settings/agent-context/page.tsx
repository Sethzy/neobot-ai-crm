/**
 * Legacy agent-context URL. Forwards to `/settings/agent/memory`, the new IA location.
 * @module app/(dashboard)/settings/agent-context/page
 */
import { redirect } from "next/navigation";

export default function LegacyAgentContextPage() {
  redirect("/settings/agent/memory");
}
