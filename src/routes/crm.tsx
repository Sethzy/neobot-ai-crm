/**
 * CRM route — contacts, deals, pipeline views.
 * UX spec §5.4.
 */
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/app-layout";

export const Route = createFileRoute("/crm")({
  component: CrmPage,
});

function CrmPage() {
  return (
    <AppLayout>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">CRM</h1>
          <p className="mt-2 text-muted-foreground">Coming soon</p>
        </div>
      </div>
    </AppLayout>
  );
}
