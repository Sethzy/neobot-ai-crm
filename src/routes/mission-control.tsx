/**
 * Mission Control route — operational dashboard with Overview + Queue tabs.
 * UX spec §5.2.
 */
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/app-layout";

export const Route = createFileRoute("/mission-control")({
  component: MissionControlPage,
});

function MissionControlPage() {
  return (
    <AppLayout>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Mission Control</h1>
          <p className="mt-2 text-muted-foreground">Coming soon</p>
        </div>
      </div>
    </AppLayout>
  );
}
