const DISTRICT_NUMBER_REGEX = /(\d{1,2})/;

export function cleanSearchTerm(input: string | undefined): string {
  return (input ?? "").trim().slice(0, 80);
}

export function extractDistrictNumber(
  district: string | null | undefined
): number | null {
  if (!district) {
    return null;
  }

  const match = district.match(DISTRICT_NUMBER_REGEX);
  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);
  if (Number.isNaN(value)) {
    return null;
  }

  return value;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .replace(/-{2,}/g, "-");
}

export function toPropertySlug(
  project: string,
  district: string | null | undefined
): string {
  const projectSlug = slugify(project);
  const districtNo = extractDistrictNumber(district);
  const districtSuffix = districtNo === null ? "dxx" : `d${districtNo.toString().padStart(2, "0")}`;

  return `${projectSlug}-${districtSuffix}`;
}

export function toAgencySlug(agencyName: string): string {
  return slugify(agencyName);
}

export function toAreaSlug(areaName: string): string {
  return slugify(areaName);
}

export function toHdbTownSlug(town: string): string {
  return slugify(town);
}

export function toHdbStreetSlug(streetName: string): string {
  return slugify(streetName);
}

export function parseDistrictFromPropertySlug(slug: string): number | null {
  const match = slug.match(/-d(\d{2}|xx)$/);
  if (!match || match[1] === "xx") {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

export function humanizeSlug(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "0";
  }

  return new Intl.NumberFormat("en-SG").format(value);
}

export function formatCurrencySgd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateMonthYear(
  value: string | null | undefined
): string {
  if (!value) {
    return "N/A";
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return "N/A";
  }

  return parsed.toLocaleDateString("en-SG", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Safely coerce a value that may be number, string, null, or undefined to a number. */
export function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/** Return the median of a numeric array, or null if empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

/** Format a min–max price range string, e.g. "$500K – $1.2M". */
export function formatPriceRange(
  min: number | null,
  max: number | null
): string {
  if (min === null || max === null) {
    return "N/A";
  }

  return `${formatCurrencySgd(min)} – ${formatCurrencySgd(max)}`;
}
