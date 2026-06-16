/**
 * Decorative preview panel for the dedicated auth screens.
 * @module components/auth/auth-preview
 */

const activityCards = [
  {
    title: "Megan Rose",
    subtitle: "Requested a pricing callback",
    className: "top-18 left-16",
  },
  {
    title: "Arun Kumar",
    subtitle: "Viewed River Valley listing",
    className: "top-38 right-20",
  },
  {
    title: "Janice Ho",
    subtitle: "Ready for a viewing slot",
    className: "top-64 right-10",
  },
];

const queueRows = [
  ["New seller lead", "Whatsapp", "Ready"],
  ["Follow-up brief", "Daily Orchestrator", "Queued"],
  ["Viewing reminder", "Calendar", "Synced"],
  ["New launch alert", "Market", "Drafted"],
];

export function AuthPreview() {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-linear-to-br from-primary via-chart-4 to-chart-1 px-10 py-12 text-primary-foreground">
      <div className="absolute left-[-8%] top-[-8%] h-72 w-72 rounded-full bg-chart-2/40 blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-6%] h-80 w-80 rounded-full bg-accent/35 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]" />

      {activityCards.map((card) => (
        <div
          key={card.title}
          className={`absolute ${card.className} rounded-2xl border border-border/30 bg-card/90 px-4 py-3 text-foreground shadow-xl backdrop-blur`}
        >
          <p className="text-sm font-semibold">{card.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{card.subtitle}</p>
        </div>
      ))}

      <div className="relative z-10 mt-auto w-full rounded-[28px] border border-border/30 bg-card/95 text-card-foreground shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <p className="text-caption font-semibold uppercase text-primary">
              NeoBot automations
            </p>
            <h2 className="mt-1 font-serif text-subhead text-foreground">
              Conversion queue
            </h2>
          </div>
          <div className="rounded-full bg-primary/10 px-3 py-1 text-caption font-medium text-primary">
            4 live tasks
          </div>
        </div>

        <div className="grid grid-cols-[1.4fr_1fr_0.8fr] gap-4 border-b border-border px-6 py-4 text-caption font-semibold uppercase text-muted-foreground">
          <span>Workflow</span>
          <span>Source</span>
          <span>Status</span>
        </div>

        <div className="px-4 py-2">
          {queueRows.map(([workflow, source, status]) => (
            <div
              key={workflow}
              className="grid grid-cols-[1.4fr_1fr_0.8fr] items-center gap-4 rounded-2xl px-2 py-3 text-meta text-foreground even:bg-muted/30"
            >
              <span className="font-medium">{workflow}</span>
              <span className="text-muted-foreground">{source}</span>
              <span className="justify-self-start rounded-full bg-primary/10 px-3 py-1 text-caption font-semibold text-primary">
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
