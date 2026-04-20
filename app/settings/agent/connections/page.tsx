/**
 * Settings → Agent → Connections. Placeholder for Composio OAuth integration management.
 * @module app/(dashboard)/settings/agent/connections/page
 */
import { SettingsStubPage } from "@/components/settings/settings-stub-page";

export default function ConnectionsPage() {
  return (
    <SettingsStubPage
      title="Connections"
      description="OAuth-connected tools the agent can call."
      note="Google Drive, Docs, Sheets, and other Composio integrations will be listed here. For now the agent discovers and uses them dynamically inside chat."
    />
  );
}
