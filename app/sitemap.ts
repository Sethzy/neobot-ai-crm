import type { MetadataRoute } from "next";
import {
  toAgencySlug,
  toAreaSlug,
  toHdbStreetSlug,
  toHdbTownSlug,
  toPropertySlug,
} from "@/lib/property/utils";
import { getSiteUrl } from "@/lib/site-url";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyPublicServerClient } from "@/lib/supabase/property-public-server";

export const revalidate = 86_400;

const CHUNK_SIZE = 4_000;
const PROPERTY_LIMIT = 60_000;
const AGENCY_LIMIT = 20_000;
const AREA_LIMIT = 50_000;
const HDB_LIMIT = 60_000;

const STATIC_ROUTES = [
  "",
  "/demo",
  "/use-cases",
  "/industries",
  "/agents",
  "/properties",
  "/hdb",
  "/agencies",
  "/areas",
];

type ExtraSitemapEntry = {
  url: string;
  lastModified: string;
};

type AgentSitemapRow = {
  registration_no: string | null;
  updated_at: string | null;
};

type PropertySitemapRow = {
  project: string | null;
  district: string | null;
  contract_date: string | null;
};

type AgencySitemapRow = {
  estate_agent_name: string | null;
  updated_at: string | null;
};

type AreaSitemapRow = {
  town: string | null;
  district: string | null;
  transaction_date: string | null;
};

type HdbSitemapRow = {
  town: string | null;
  street_name: string | null;
  month: string | null;
};

function toIsoDate(value: string | null | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

async function getAgentCount(): Promise<number> {
  const client = createPropertyPublicServerClient();
  const { count, error } = await client
    .from("cea_agents")
    .select("registration_no", { count: "exact", head: true });

  if (error) {
    throw new Error(`Failed to count agents for sitemap: ${error.message}`);
  }

  return count ?? 0;
}

async function getAgentEntriesChunk(
  id: number,
  siteUrl: string
): Promise<MetadataRoute.Sitemap> {
  const from = id * CHUNK_SIZE;
  const to = from + CHUNK_SIZE - 1;

  const client = createPropertyPublicServerClient();
  const { data, error } = await client
    .from("cea_agents")
    .select("registration_no, updated_at")
    .order("registration_no", { ascending: true })
    .range(from, to);

  if (error) {
    throw new Error(`Failed to load agent sitemap chunk: ${error.message}`);
  }

  return ((data ?? []) as AgentSitemapRow[])
    .filter((row) => Boolean(row.registration_no))
    .map((row) => ({
      url: `${siteUrl}/agents/${row.registration_no}`,
      lastModified: row.updated_at ?? new Date().toISOString(),
      changeFrequency: "weekly",
      priority: 0.8,
    }));
}

async function getExtraEntries(siteUrl: string): Promise<ExtraSitemapEntry[]> {
  const client = createPropertyPublicServerClient();

  const [propertiesResult, agenciesResult, areasResult, hdbResult] =
    await Promise.all([
      client
        .from("ura_transactions")
        .select("project, district, contract_date")
        .order("contract_date", { ascending: false })
        .limit(PROPERTY_LIMIT),
      client
        .from("cea_agents")
        .select("estate_agent_name, updated_at")
        .not("estate_agent_name", "is", null)
        .order("updated_at", { ascending: false })
        .limit(AGENCY_LIMIT),
      client
        .from("cea_transactions")
        .select("town, district, transaction_date")
        .order("transaction_date", { ascending: false })
        .limit(AREA_LIMIT),
      client
        .from("hdb_resale_transactions")
        .select("town, street_name, month")
        .not("town", "is", null)
        .not("street_name", "is", null)
        .order("month", { ascending: false })
        .limit(HDB_LIMIT),
    ]);

  for (const result of [
    propertiesResult,
    agenciesResult,
    areasResult,
    hdbResult,
  ]) {
    if (result.error) {
      throw new Error(`Failed to load sitemap source rows: ${result.error.message}`);
    }
  }

  const out: ExtraSitemapEntry[] = [];

  for (const path of STATIC_ROUTES) {
    out.push({
      url: `${siteUrl}${path}`,
      lastModified: new Date().toISOString(),
    });
  }

  const seenProperties = new Set<string>();
  for (const row of (propertiesResult.data ?? []) as PropertySitemapRow[]) {
    const project = row.project?.trim();
    if (!project) {
      continue;
    }

    const key = `${project}::${row.district ?? ""}`;
    if (seenProperties.has(key)) {
      continue;
    }
    seenProperties.add(key);

    out.push({
      url: `${siteUrl}/properties/${toPropertySlug(project, row.district)}`,
      lastModified: toIsoDate(row.contract_date),
    });
  }

  const seenAgencies = new Set<string>();
  for (const row of (agenciesResult.data ?? []) as AgencySitemapRow[]) {
    const agencyName = row.estate_agent_name?.trim();
    if (!agencyName || seenAgencies.has(agencyName)) {
      continue;
    }
    seenAgencies.add(agencyName);

    out.push({
      url: `${siteUrl}/agencies/${toAgencySlug(agencyName)}`,
      lastModified: row.updated_at ?? new Date().toISOString(),
    });
  }

  const seenAreas = new Set<string>();
  for (const row of (areasResult.data ?? []) as AreaSitemapRow[]) {
    const areaName = row.town?.trim() || row.district?.trim();
    if (!areaName || seenAreas.has(areaName)) {
      continue;
    }
    seenAreas.add(areaName);

    out.push({
      url: `${siteUrl}/areas/${toAreaSlug(areaName)}`,
      lastModified: toIsoDate(row.transaction_date),
    });
  }

  const seenHdbStreets = new Set<string>();
  for (const row of (hdbResult.data ?? []) as HdbSitemapRow[]) {
    const town = row.town?.trim();
    const street = row.street_name?.trim();
    if (!town || !street) {
      continue;
    }

    const key = `${town}::${street}`;
    if (seenHdbStreets.has(key)) {
      continue;
    }
    seenHdbStreets.add(key);

    out.push({
      url: `${siteUrl}/hdb/${toHdbTownSlug(town)}/${toHdbStreetSlug(street)}`,
      lastModified: toIsoDate(row.month),
    });
  }

  return out;
}

export async function generateSitemaps() {
  if (!isPropertySupabaseConfigured()) {
    return [{ id: 0 }];
  }

  const [agentCount, extraEntries] = await Promise.all([
    getAgentCount(),
    getExtraEntries(getSiteUrl()),
  ]);

  const agentChunks = Math.max(1, Math.ceil(agentCount / CHUNK_SIZE));
  const extraChunks = Math.max(1, Math.ceil(extraEntries.length / CHUNK_SIZE));
  const totalChunks = agentChunks + extraChunks;

  return Array.from({ length: totalChunks }, (_, id) => ({ id }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();

  if (!isPropertySupabaseConfigured()) {
    return STATIC_ROUTES.map((path) => ({
      url: `${siteUrl}${path}`,
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly",
      priority: path === "" ? 1 : 0.7,
    }));
  }

  const agentCount = await getAgentCount();
  const agentChunks = Math.max(1, Math.ceil(agentCount / CHUNK_SIZE));

  if (id < agentChunks) {
    return getAgentEntriesChunk(id, siteUrl);
  }

  const extraChunkIndex = id - agentChunks;
  const extraEntries = await getExtraEntries(siteUrl);
  const start = extraChunkIndex * CHUNK_SIZE;
  const end = start + CHUNK_SIZE;

  return extraEntries.slice(start, end).map((entry) => ({
    url: entry.url,
    lastModified: entry.lastModified,
    changeFrequency: "weekly",
    priority: 0.7,
  }));
}
