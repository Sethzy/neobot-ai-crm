/** Movement history section for agent profiles. */
import { AppIcon } from "@/components/icons/app-icons";

type MovementHistoryProps = {
  agencyName: string | null;
  registrationStart: string | null;
  registrationEnd: string | null;
};

function formatMonthYear(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleDateString("en-SG", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function MovementHistory({
  agencyName,
  registrationStart,
  registrationEnd,
}: MovementHistoryProps) {
  const start = formatMonthYear(registrationStart);
  const end = formatMonthYear(registrationEnd);

  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-zinc-900">Movement History</h3>
        <p className="text-sm text-zinc-500">Agency transfers</p>
      </div>

      {agencyName ? (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50/50 p-4">
          <AppIcon name="arrowRight" className="h-5 w-5 shrink-0 text-zinc-400" />
          <div>
            <p className="text-sm font-medium text-zinc-900">{agencyName}</p>
            <p className="text-xs text-zinc-500">
              {start ? `Registered since ${start}` : "Registration date not available"}
              {end ? ` · Expires ${end}` : ""}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <AppIcon name="arrowRight" className="h-8 w-8 text-zinc-300" />
          <p className="text-sm text-zinc-500">
            No movement history recorded for this agent
          </p>
        </div>
      )}
    </div>
  );
}
