/**
 * Banner shown when a user fork trails the latest predefined skill version.
 *
 * @module app/(dashboard)/skills/update-available-banner
 */
import { Button } from "@/components/ui/button";

import { acknowledgeForkAction, overwriteForkAction } from "./actions";

interface UpdateAvailableBannerProps {
  slug: string;
  currentForkVersion: string;
  latestVersion: string;
}

export function UpdateAvailableBanner({
  slug,
  currentForkVersion,
  latestVersion,
}: UpdateAvailableBannerProps) {
  return (
    <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
      <p className="mb-3">
        Sunder updated this playbook to v{latestVersion.slice(0, 8)}. Your copy
        was forked from v{currentForkVersion.slice(0, 8)}.
      </p>
      <div className="flex gap-2">
        <form action={acknowledgeForkAction.bind(null, slug)}>
          <Button type="submit" size="sm" variant="ghost">
            Keep mine
          </Button>
        </form>
        <form action={overwriteForkAction.bind(null, slug)}>
          <Button type="submit" size="sm">
            Overwrite
          </Button>
        </form>
      </div>
    </div>
  );
}
