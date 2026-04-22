/**
 * Full-screen settings surface. Replaces the main dashboard chrome — no app sidebar,
 * no app header. On `md+` the rail sits inline on the left; on smaller screens a
 * top bar exposes a hamburger that opens the nav in a drawer.
 * @module app/settings/layout
 */
import { SettingsMobileNav } from "@/components/settings/settings-mobile-nav";
import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-svh w-full flex-col bg-background md:flex-row">
      <SettingsMobileNav />
      <aside className="hidden w-64 shrink-0 flex-col gap-5 border-r border-app-border-subtle bg-app-sidebar px-4 py-6 md:flex">
        <SettingsNav />
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
