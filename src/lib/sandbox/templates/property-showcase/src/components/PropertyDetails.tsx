/**
 * Property details section for the property showcase template.
 */
import type { PropertyData } from "../types";

interface PropertyDetailsProps {
  property: PropertyData;
}

export function PropertyDetails({ property }: PropertyDetailsProps) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-stone-900/80 p-6 shadow-xl shadow-black/10">
      <div className="mb-6 space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-stone-400">Property Story</p>
        <h2 className="text-2xl font-semibold text-white">Why this home stands out</h2>
        <p className="max-w-3xl text-base leading-7 text-stone-300">
          {property.description}
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <div className="space-y-3">
          {property.highlights.map((highlight) => (
            <div
              key={highlight}
              className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-stone-200"
            >
              {highlight}
            </div>
          ))}
        </div>
        <div className="rounded-[1.5rem] border border-amber-200/15 bg-amber-200/6 p-5">
          <p className="text-sm uppercase tracking-[0.2em] text-amber-100/70">
            Quick Facts
          </p>
          <dl className="mt-4 grid gap-4 text-sm text-stone-200">
            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3">
              <dt>Address</dt>
              <dd className="text-right font-medium">{property.address}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3">
              <dt>Floor</dt>
              <dd className="font-medium">{property.floor}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3">
              <dt>Tenure</dt>
              <dd className="font-medium">{property.tenure}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Interior Size</dt>
              <dd className="font-medium">{property.sqft} sqft</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
