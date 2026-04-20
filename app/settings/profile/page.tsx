/**
 * Settings → User → Profile. Placeholder until we build avatar / name / email editing.
 * @module app/(dashboard)/settings/profile/page
 */
import { SettingsStubPage } from "@/components/settings/settings-stub-page";

export default function ProfilePage() {
  return (
    <SettingsStubPage
      title="Profile"
      description="Your display name, avatar, and email live here."
      note="Display name, avatar, and email editing will land here. For now your account is managed via Supabase Auth."
    />
  );
}
