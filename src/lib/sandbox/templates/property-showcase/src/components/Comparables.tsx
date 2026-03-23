/**
 * Comparable listings table for the property showcase template.
 */
import type { ComparableProperty } from "../types";

interface ComparablesProps {
  comparables: ComparableProperty[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function Comparables({ comparables }: ComparablesProps) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-stone-900/80 p-6 shadow-xl shadow-black/10">
      <div className="mb-6 space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-stone-400">Comparables</p>
        <h2 className="text-2xl font-semibold text-white">Nearby reference homes</h2>
      </div>
      <div className="overflow-hidden rounded-[1.5rem] border border-white/8">
        <table className="min-w-full divide-y divide-white/8 text-left text-sm text-stone-200">
          <thead className="bg-white/6 text-stone-300">
            <tr>
              <th className="px-4 py-3 font-medium">Address</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Beds / Baths</th>
              <th className="px-4 py-3 font-medium">Size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8 bg-stone-950/40">
            {comparables.map((item) => (
              <tr key={item.address}>
                <td className="px-4 py-3">{item.address}</td>
                <td className="px-4 py-3">{formatCurrency(item.price)}</td>
                <td className="px-4 py-3">
                  {item.beds} / {item.baths}
                </td>
                <td className="px-4 py-3">{item.sqft} sqft</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
