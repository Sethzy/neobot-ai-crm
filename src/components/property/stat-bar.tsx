/** Borderless horizontal stat row — replaces StatCard grid on profile pages. */

type StatBarItem = {
  label: string;
  value: string;
  hint?: string;
};

type StatBarProps = {
  items: StatBarItem[];
};

export function StatBar({ items }: StatBarProps) {
  return (
    <div className="grid grid-cols-2 gap-y-6 gap-x-4 sm:grid-cols-3 xl:flex xl:flex-row xl:items-start xl:gap-0">
      {items.map((item, i) => (
        <div key={item.label} className="flex xl:flex-row xl:items-start">
          {/* Vertical divider — visible only in xl flex row, not on first item */}
          {i > 0 ? (
            <div className="mr-6 hidden h-12 w-px bg-zinc-200 xl:block" />
          ) : null}
          <div className={i > 0 ? "xl:ml-0" : ""}>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              {item.label}
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
              {item.value}
            </p>
            {item.hint ? (
              <p className="mt-0.5 text-sm text-zinc-500">{item.hint}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
