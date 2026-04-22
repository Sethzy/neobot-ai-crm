/**
 * Placeholder surface for settings sub-pages that aren't built yet.
 * Renders a title and a one-line intent description so users see what will live here.
 * @module components/settings/settings-stub-page
 */
import { PageHeader } from "@/components/layout/page-header";
import { PageCanvas } from "@/components/layout/page-canvas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SettingsStubPageProps {
  title: string;
  description: string;
  note?: string;
}

export function SettingsStubPage({ title, description, note }: SettingsStubPageProps) {
  return (
    <PageCanvas variant="form" contentClassName="max-w-2xl">
        <PageHeader title={title} description={description} />

        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader className="gap-2">
            <CardDescription className="type-row-meta">Coming soon</CardDescription>
            <CardTitle className="type-toolbar-title">{title}</CardTitle>
          </CardHeader>
          <CardContent className="type-toolbar-description">
            <p>{note ?? "This section is in the roadmap and will land in a future release."}</p>
          </CardContent>
        </Card>
    </PageCanvas>
  );
}
