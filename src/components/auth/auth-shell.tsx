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
    <div className="min-h-screen bg-[#f5f2eb] lg:grid lg:grid-cols-[minmax(420px,520px)_1fr]">
      <section className="flex min-h-screen flex-col justify-between px-6 py-8 sm:px-10 lg:px-14 lg:py-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-3 text-[#191919]">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#111827] text-sm font-semibold uppercase tracking-[0.2em] text-white">
              S
            </span>
            <span className="text-[1.75rem] font-semibold tracking-[-0.05em]">
              sunder
            </span>
          </Link>

          <span className="rounded-full border border-black/10 bg-white/60 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-[#7a7267]">
            {modeLabel}
          </span>
        </div>

        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          <h1 className="text-4xl font-semibold tracking-[-0.06em] text-[#171717] sm:text-[3.5rem]">
            {title}
          </h1>
          <p className="mt-4 max-w-md text-base leading-7 text-[#71695e]">
            {description}
          </p>

          <div className="mt-10">{children}</div>
        </main>

        <div className="space-y-3 text-sm text-[#756d61]">
          <div>{footer}</div>
          <p className="text-xs text-[#8d857a]">
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
