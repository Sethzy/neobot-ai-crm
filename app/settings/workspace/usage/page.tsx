/**
 * Settings → Workspace → Usage. Placeholder for LLM spend and run counts.
 * @module app/(dashboard)/settings/workspace/usage/page
 */
import { SettingsStubPage } from "@/components/settings/settings-stub-page";

export default function UsagePage() {
  return (
    <SettingsStubPage
      title="Usage"
      description="Message counts, token spend, and agent run history."
      note="Detailed usage analytics — message counts versus plan caps, LLM token spend, and run-level history — will land here."
    />
  );
}
