/**
 * Static loading shell for the inner settings content area.
 * This renders inside the persistent settings layout chrome.
 * @module components/settings/settings-page-loading
 */
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsPageShell } from "./settings-page-shell";

/**
 * Mirrors the width and rhythm of settings pages without recreating the rail.
 */
export function SettingsPageLoading() {
  return (
    <SettingsPageShell
      data-testid="settings-page-loading-shell"
      aria-busy="true"
    >
      <div className="space-y-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton
          data-testid="settings-loading-line"
          className="h-4 w-full max-w-xl"
        />
        <Skeleton
          data-testid="settings-loading-line"
          className="h-4 w-full max-w-2xl"
        />
      </div>

      <div className="surface-app space-y-4 p-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton
            key={index}
            data-testid="settings-loading-line"
            className="h-5 w-full max-w-xl"
          />
        ))}
      </div>
    </SettingsPageShell>
  );
}
