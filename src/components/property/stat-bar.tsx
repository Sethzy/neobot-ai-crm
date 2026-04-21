/** Borderless horizontal stat row with responsive columns and subtle dividers. */

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
    <dl className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:flex lg:gap-0">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={`text-center lg:flex-1 lg:px-5 ${
            index === 0 ? "lg:pl-0" : "lg:border-l lg:border-border/50"
          } ${index === items.length - 1 ? "lg:pr-0" : ""}`}
        >
          <dd className="text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-3xl">
            {item.value}
          </dd>
          <dt className="mt-1 text-xs text-muted-foreground">
            {item.label}
          </dt>
          {item.hint ? (
            <p className="mt-0.5 text-caption text-muted-foreground/70">{item.hint}</p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
