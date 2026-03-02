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
    <div
      className="grid gap-y-4"
      style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
    >
      {items.map((item) => (
        <div key={item.label} className="text-center">
          <p className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            {item.value}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {item.label}
          </p>
          {item.hint ? (
            <p className="text-xs text-zinc-400">{item.hint}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
