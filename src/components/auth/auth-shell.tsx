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
    <div className="relative flex min-h-dvh justify-center bg-white md:px-12 lg:px-0">
      <section className="relative z-10 flex flex-1 flex-col bg-background px-6 py-10 shadow-2xl sm:justify-center md:flex-none md:px-28">
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
        <div className="absolute inset-0 bg-[url('/exports/hero-watercolor.webp')] bg-cover bg-center opacity-25 mix-blend-overlay" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_35%,rgba(64,145,108,0.38),transparent_42%),linear-gradient(135deg,rgba(2,79,70,0.95),rgba(2,79,70,0.82))]" />

        <div className="relative z-10 flex h-full items-center justify-center p-12">
          <div className="flex w-full max-w-md flex-col gap-6">
            {featureItems.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.title}
                  className="group relative flex gap-5 rounded-2xl border border-white/10 bg-white/10 p-6 text-white shadow-2xl shadow-black/20 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white/15"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white shadow-inner transition duration-300 group-hover:bg-white/20">
                    <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={1.7} />
                  </div>
                  <div>
                    <h2 className="font-serif text-lg font-medium tracking-tight text-white">
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
      </aside>
    </div>
  );
}
