/**
 * Placeholder surface for settings sub-pages that aren't built yet.
 * Renders a title and a one-line intent description so users see what will live here.
 * @module components/settings/settings-stub-page
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SettingsStubPageProps {
  title: string;
  description: string;
  note?: string;
}

export function SettingsStubPage({ title, description, note }: SettingsStubPageProps) {
  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader className="gap-2">
            <CardDescription>Coming soon</CardDescription>
            <CardTitle className="text-xl">{title}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>{note ?? "This section is in the roadmap and will land in a future release."}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
