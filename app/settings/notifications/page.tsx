/**
 * Settings → User → Notifications. Placeholder for channel/preferences editing.
 * @module app/(dashboard)/settings/notifications/page
 */
import { SettingsStubPage } from "@/components/settings/settings-stub-page";

export default function NotificationsPage() {
  return (
    <SettingsStubPage
      title="Notifications"
      description="Choose when and where your agent pings you."
      note="Web push, Telegram, and email notification preferences for autopilot runs and approval requests will land here."
    />
  );
}
