/**
 * Shared split-screen shell for dedicated login and signup pages.
 * @module components/auth/auth-shell
 */
import Link from "next/link";

import { AuthPreview } from "@/components/auth/auth-preview";

interface AuthShellProps {
  children: React.ReactNode;
  description: string;
  footer: React.ReactNode;
  modeLabel: string;
  title: string;
}

export function AuthShell({
  children,
  description,
  footer,
  modeLabel,
  title,
}: AuthShellProps) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(420px,520px)_1fr]">
      <section className="flex min-h-screen flex-col justify-between px-6 py-8 sm:px-10 lg:px-14 lg:py-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-3 text-foreground">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-meta font-semibold uppercase text-primary-foreground">
              S
            </span>
            <span className="font-serif text-subhead text-foreground">
              sunder
            </span>
          </Link>

          <span className="rounded-full border border-border bg-card/80 px-3 py-1 text-caption font-medium uppercase text-muted-foreground">
            {modeLabel}
          </span>
        </div>

        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          <h1 className="font-serif text-title text-foreground sm:text-display">
            {title}
          </h1>
          <p className="measure-copy mt-4 max-w-md text-body text-muted-foreground">
            {description}
          </p>

          <div className="mt-10">{children}</div>
        </main>

        <div className="space-y-3 text-meta text-muted-foreground">
          <div>{footer}</div>
          <p className="text-caption text-muted-foreground/80">
            Protected by Supabase Auth. External-facing actions still require approval in-product.
          </p>
        </div>
      </section>

      <aside className="hidden lg:block">
        <AuthPreview />
      </aside>
    </div>
  );
}
