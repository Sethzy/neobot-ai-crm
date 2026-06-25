/**
 * Shared split-screen shell for dedicated login and signup pages.
 * @module components/auth/auth-shell
 */
import Link from "next/link";
import { CheckCircle2, Clock3, FileText, Link2, ShieldCheck } from "lucide-react";

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
          <div className="grid w-full max-w-3xl gap-10 xl:grid-cols-[1fr_0.9fr] xl:items-center">
            <div>
              <p className="text-meta font-medium text-white/70">
                Autopilot with approval built in
              </p>
              <h2 className="mt-4 max-w-lg text-4xl font-semibold leading-[1.04] tracking-[-0.035em] text-white">
                The work is ready before you open the tab.
              </h2>
              <p className="mt-5 max-w-md text-base leading-7 text-white/72">
                NeoBot handles the internal work, keeps the context attached,
                and stops before anything client-facing leaves your desk.
              </p>
            </div>

            <div className="rounded-xl border border-white/15 bg-white p-5 text-lp-dark shadow-sm">
              <div className="flex items-center justify-between gap-4 border-b border-lp-border pb-4">
                <div>
                  <p className="text-caption font-semibold uppercase tracking-[0.12em] text-sunder-green">
                    Ready for review
                  </p>
                  <h3 className="mt-1 text-lg font-semibold tracking-[-0.015em]">
                    Follow-up drafted for Rachel Ng
                  </h3>
                </div>
                <span className="rounded-full bg-sunder-green px-3 py-1 text-caption font-semibold text-white">
                  Approval
                </span>
              </div>

              <div className="space-y-4 py-5">
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lp-panel-muted text-sunder-green">
                    <FileText aria-hidden="true" className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Context attached</p>
                    <p className="mt-1 text-sm leading-6 text-lp-muted">
                      Deal notes, last meeting recap, and open tasks are already linked.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lp-panel-muted text-sunder-green">
                    <Clock3 aria-hidden="true" className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Next action queued</p>
                    <p className="mt-1 text-sm leading-6 text-lp-muted">
                      Send after you approve, then update the CRM automatically.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-lp-panel-muted px-4 py-3 text-sm leading-6 text-lp-muted">
                "Hi Rachel, I pulled together the comparison we discussed..."
              </div>
            </div>

            <div className="divide-y divide-white/15 border-y border-white/15 xl:col-span-2">
              {featureItems.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className="grid gap-4 py-5 text-white sm:grid-cols-[2.5rem_1fr] xl:grid-cols-[2.5rem_14rem_1fr] xl:items-start"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/20 text-white">
                      <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={1.7} />
                    </div>
                    <h3 className="text-base font-semibold tracking-[-0.01em] text-white">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-white/72">
                      {item.description}
                    </p>
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
