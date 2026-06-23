/**
 * Shared split-screen shell for dedicated login and signup pages.
 * @module components/auth/auth-shell
 */
import Link from "next/link";
import { CheckCircle2, Link2, ShieldCheck } from "lucide-react";

import { siteBrand } from "@/lib/branding/site";

interface AuthShellProps {
  children: React.ReactNode;
  description?: string;
  footer: React.ReactNode;
  title: string;
}

const featureItems = [
  {
    icon: ShieldCheck,
    title: "Your judgment stays in control",
    description: "External-facing actions wait for approval before anything is sent.",
  },
  {
    icon: CheckCircle2,
    title: "Follow-ups already drafted",
    description: "NeoBot prepares the next touchpoint before warm leads go cold.",
  },
  {
    icon: Link2,
    title: "CRM context compounds",
    description: "Contacts, deals, tasks, and memory stay connected across every run.",
  },
];

export function AuthShell({
  children,
  description,
  footer,
  title,
}: AuthShellProps) {
  return (
    <div className="relative flex min-h-dvh justify-center bg-lp-canvas md:px-12 lg:px-0">
      <section className="relative z-10 flex flex-1 flex-col border-lp-border bg-background px-6 py-10 sm:justify-center md:flex-none md:px-28 lg:border-r">
        <main className="mx-auto w-full max-w-sm sm:px-4 md:w-80 md:px-0">
          <Link href="/" aria-label="Home" className="inline-flex items-center gap-3 text-foreground">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sunder-green text-xs font-bold text-white shadow-sm">
              {siteBrand.name.charAt(0)}
            </span>
            <span className="text-base font-semibold tracking-tight text-foreground">
              {siteBrand.name}
            </span>
          </Link>

          <h1 className="mt-8 text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}

          <div className="mt-10">{children}</div>

          <div className="mt-8 text-sm text-muted-foreground">{footer}</div>
        </main>
      </section>

      <aside className="hidden sm:contents lg:relative lg:block lg:flex-1">
        <div className="absolute inset-0 bg-sunder-green" />

        <div className="relative z-10 flex h-full items-center justify-center p-12">
          <div className="w-full max-w-md">
            <p className="max-w-sm text-3xl font-semibold leading-tight tracking-[-0.025em] text-white">
              Keep the work moving without giving up control.
            </p>
            <div className="mt-10 divide-y divide-white/15 border-y border-white/15">
              {featureItems.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className="flex gap-4 py-6 text-white"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/20 text-white">
                      <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={1.7} />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold tracking-[-0.01em] text-white">
                        {item.title}
                      </h2>
                      <p className="mt-1 text-sm leading-relaxed text-white/78">
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
