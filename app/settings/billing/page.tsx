/**
 * Legacy billing URL. Stripe checkout success and the Customer Portal return_url both land
 * here; we forward to the canonical `/settings/workspace/billing` location while preserving
 * query strings (e.g. `?billing=success`).
 * @module app/(dashboard)/settings/billing/page
 */
import { redirect } from "next/navigation";

interface LegacyBillingPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function serializeSearchParams(
  params: Record<string, string | string[] | undefined>,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else if (typeof value === "string") {
      qs.set(key, value);
    }
  }
  const serialized = qs.toString();
  return serialized ? `?${serialized}` : "";
}

export default async function LegacyBillingPage({ searchParams }: LegacyBillingPageProps) {
  const resolved = searchParams ? await searchParams : {};
  redirect(`/settings/workspace/billing${serializeSearchParams(resolved)}`);
}
