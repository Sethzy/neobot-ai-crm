/** Reusable stat card for property profile pages. */
import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
};

export function StatCard({ label, value, hint, icon }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        {icon ? (
          <span className="text-sunder-green">{icon}</span>
        ) : null}
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </p>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
        {value}
      </p>
      {hint ? <p className="mt-2 text-sm text-zinc-600">{hint}</p> : null}
    </div>
  );
}
