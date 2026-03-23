/**
 * Neighborhood overview section for the property showcase template.
 */
import type { NeighborhoodData } from "../types";

interface NeighborhoodMapProps {
  neighborhood: NeighborhoodData;
}

export function NeighborhoodMap({ neighborhood }: NeighborhoodMapProps) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-xl shadow-black/10">
      <div className="mb-6 space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-stone-400">Neighborhood</p>
        <h2 className="text-2xl font-semibold text-white">{neighborhood.name}</h2>
        <p className="max-w-3xl text-base leading-7 text-stone-300">
          {neighborhood.overview}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[1.5rem] border border-white/8 bg-stone-950/60 p-5">
          <p className="text-sm uppercase tracking-[0.2em] text-stone-400">Around You</p>
          <ul className="mt-4 grid gap-3 text-stone-200">
            {neighborhood.commute.map((item) => (
              <li key={item} className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[1.5rem] border border-amber-200/15 bg-amber-200/6 p-5">
          <p className="text-sm uppercase tracking-[0.2em] text-amber-100/70">Top Schools</p>
          <ul className="mt-4 space-y-3 text-stone-200">
            {neighborhood.schools.map((school) => (
              <li key={school} className="border-b border-white/8 pb-3 last:border-b-0">
                {school}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
