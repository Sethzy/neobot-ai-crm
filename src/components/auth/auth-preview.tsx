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
  ["Follow-up brief", "Autopilot", "Queued"],
  ["Viewing reminder", "Calendar", "Synced"],
  ["New launch alert", "Market", "Drafted"],
];

export function AuthPreview() {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[#143574] px-10 py-12 text-white">
      <div className="absolute left-[-8%] top-[-8%] h-72 w-72 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(108,181,255,0.95),rgba(61,116,230,0.82)_48%,rgba(61,116,230,0)_72%)] blur-sm" />
      <div className="absolute bottom-[-10%] right-[-6%] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(136,222,255,0.95),rgba(70,171,235,0.8)_45%,rgba(70,171,235,0)_74%)] blur-sm" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]" />

      {activityCards.map((card) => (
        <div
          key={card.title}
          className={`absolute ${card.className} rounded-2xl border border-white/12 bg-white/85 px-4 py-3 text-[#1c2844] shadow-[0_20px_45px_-28px_rgba(15,23,42,0.9)] backdrop-blur`}
        >
          <p className="text-sm font-semibold">{card.title}</p>
          <p className="mt-1 text-xs text-[#5f6880]">{card.subtitle}</p>
        </div>
      ))}

      <div className="relative z-10 mt-auto w-full rounded-[28px] border border-white/12 bg-white/92 text-[#1f2937] shadow-[0_45px_90px_-55px_rgba(15,23,42,0.95)]">
        <div className="flex items-center justify-between border-b border-[#d9deea] px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6780b8]">
              Sunder autopilot
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
              Conversion queue
            </h2>
          </div>
          <div className="rounded-full bg-[#e7eefc] px-3 py-1 text-xs font-medium text-[#3457a6]">
            4 live tasks
          </div>
        </div>

        <div className="grid grid-cols-[1.4fr_1fr_0.8fr] gap-4 border-b border-[#e6e9f2] px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#7c869e]">
          <span>Workflow</span>
          <span>Source</span>
          <span>Status</span>
        </div>

        <div className="px-4 py-2">
          {queueRows.map(([workflow, source, status]) => (
            <div
              key={workflow}
              className="grid grid-cols-[1.4fr_1fr_0.8fr] items-center gap-4 rounded-2xl px-2 py-3 text-sm text-[#273246] even:bg-[#f7f9fc]"
            >
              <span className="font-medium">{workflow}</span>
              <span className="text-[#6b7489]">{source}</span>
              <span className="justify-self-start rounded-full bg-[#edf3ff] px-3 py-1 text-xs font-semibold text-[#3156a5]">
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
