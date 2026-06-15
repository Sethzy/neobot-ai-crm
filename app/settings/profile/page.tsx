/**
 * Settings → User → Profile.
 * Personal account settings.
 * @module app/(dashboard)/settings/profile/page
 */
import { PageHeader } from "@/components/layout/page-header";
import { PageSurface } from "@/components/layout/page-canvas";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";

export default async function ProfilePage() {
  return (
    <SettingsPageShell width="wide">
      <PageHeader
        title="Profile"
        description="Manage account-level details for your Sunder workspace."
        descriptionClassName="max-w-3xl"
      />

      <PageSurface padding="lg">
        <div className="space-y-1">
          <h2 className="type-section-title">Account access</h2>
          <p className="max-w-2xl type-control-muted text-muted-foreground">
            Profile details and sign-in security are managed by your authentication provider.
          </p>
        </div>
      </PageSurface>
    </SettingsPageShell>
  );
}
