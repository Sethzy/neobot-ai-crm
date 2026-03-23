/**
 * Hero section for the property showcase template.
 */
import { Bath, BedDouble, MapPin, Ruler } from "lucide-react";

import type { PropertyData } from "../types";

interface HeroProps {
  property: PropertyData;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function Hero({ property }: HeroProps) {
  return (
    <section className="relative isolate overflow-hidden border-b border-white/10">
      <img
        alt={property.photos[0]?.alt ?? property.address}
        className="absolute inset-0 h-full w-full object-cover opacity-25"
        src={property.photos[0]?.src}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-stone-950/50 via-stone-950/70 to-stone-950" />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-18 sm:px-6 lg:px-8">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm text-amber-100">
          <MapPin className="h-4 w-4" />
          {property.address}
        </div>
        <div className="max-w-3xl space-y-4">
          <p className="text-sm uppercase tracking-[0.25em] text-stone-300">
            Private Property Showcase
          </p>
          <h1 className="text-4xl leading-tight font-semibold sm:text-5xl">
            {property.headline}
          </h1>
          <p className="max-w-2xl text-lg text-stone-200/90">
            {property.subheadline}
          </p>
          <p className="text-3xl font-semibold text-amber-200">
            {formatCurrency(property.price)}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur">
            <div className="flex items-center gap-2 text-stone-300">
              <BedDouble className="h-4 w-4" />
              Bedrooms
            </div>
            <p className="mt-2 text-2xl font-semibold">{property.bedrooms}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur">
            <div className="flex items-center gap-2 text-stone-300">
              <Bath className="h-4 w-4" />
              Bathrooms
            </div>
            <p className="mt-2 text-2xl font-semibold">{property.bathrooms}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur">
            <div className="flex items-center gap-2 text-stone-300">
              <Ruler className="h-4 w-4" />
              Interior
            </div>
            <p className="mt-2 text-2xl font-semibold">{property.sqft} sqft</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur">
            <p className="text-stone-300">Tenure</p>
            <p className="mt-2 text-2xl font-semibold">{property.tenure}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
