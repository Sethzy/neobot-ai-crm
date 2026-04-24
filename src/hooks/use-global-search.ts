/**
 * Client-side global search across CRM records and chat threads.
 * Provides a ranked mixed-entity result list plus a local recent-history model
 * for the Attio-style idle search panel.
 *
 * @module hooks/use-global-search
 */
"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import {
  buildIlikePattern,
  buildSearchExpression,
} from "@/lib/crm/postgrest-filters";
import {
  formatCompactCurrency,
  formatContactFullName,
  formatCrmDate,
  formatCrmEnumLabel,
  formatDealStageLabel,
} from "@/lib/crm/display";
import { getCompanyLogoUrl } from "@/lib/branding/logo-urls";
import {
  readVersionedJSON,
  writeVersionedJSON,
} from "@/lib/storage/versioned-local";
import { supabase } from "@/lib/supabase";

export type SearchEntityType =
  | "company"
  | "contact"
  | "deal"
  | "task"
  | "thread";

export interface GlobalSearchRecord {
  entityType: SearchEntityType;
  id: string;
  key: string;
  title: string;
  subtitle: string | null;
  meta: string | null;
  badgeLabel: string;
  href: string;
  imageUrl: string | null;
  updatedAt: string;
}

interface StoredRecentSearchRecord {
  entityType: SearchEntityType;
  id: string;
  title: string;
  subtitle: string | null;
  meta: string | null;
  badgeLabel: string;
  href: string;
  imageUrl: string | null;
  updatedAt: string;
  lastOpenedAt: string;
}

interface UseGlobalSearchRecordsOptions {
  open: boolean;
  query: string;
}

const idleStoragePrefix = "sunder:global-search:recent:v1";
const idleResultLimit = 10;
const searchResultLimit = 14;
const perEntitySearchLimit = 8;
const globalSearchRecentsStorageVersion = 1;
const perEntityIdleLimit = {
  company: 4,
  contact: 4,
  deal: 4,
  task: 0,
  thread: 0,
} satisfies Record<SearchEntityType, number>;

const entityPriorityRank = {
  contact: 5,
  company: 4,
  deal: 3,
  task: 2,
  thread: 1,
} satisfies Record<SearchEntityType, number>;

const idleEntityPriorityRank = {
  company: 5,
  contact: 4,
  deal: 3,
  task: 2,
  thread: 1,
} satisfies Record<SearchEntityType, number>;

function formatWebsiteLabel(website: string | null) {
  if (!website) {
    return null;
  }

  return website.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function buildRecordHref(entityType: SearchEntityType, id: string) {
  switch (entityType) {
    case "company":
      return `/customers/companies?detail=${id}`;
    case "contact":
      return `/customers/people?detail=${id}`;
    case "deal":
      return `/customers/deals?detail=${id}`;
    case "task":
      return `/tasks?detail=${id}`;
    case "thread":
      return `/chat/${id}`;
  }
}

function makeRecord(
  entityType: SearchEntityType,
  id: string,
  title: string,
  subtitle: string | null,
  meta: string | null,
  updatedAt: string,
  imageUrl?: string | null,
): GlobalSearchRecord {
  const badgeLabelMap: Record<SearchEntityType, string> = {
    company: "Company",
    contact: "Person",
    deal: "Deal",
    task: "Task",
    thread: "Thread",
  };

  return {
    entityType,
    id,
    key: `${entityType}:${id}`,
    title,
    subtitle,
    meta,
    badgeLabel: badgeLabelMap[entityType],
    href: buildRecordHref(entityType, id),
    imageUrl: imageUrl ?? null,
    updatedAt,
  };
}

function normalizeSearchText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function getStorageKey(clientId: string) {
  return `${idleStoragePrefix}:${clientId}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStoredRecentRecords(clientId: string) {
  if (!canUseStorage()) {
    return [] as StoredRecentSearchRecord[];
  }

  const parsed = readVersionedJSON<unknown>(
    getStorageKey(clientId),
    globalSearchRecentsStorageVersion,
    [],
  );

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((item): item is StoredRecentSearchRecord => {
      return Boolean(
        item
          && typeof item === "object"
          && "entityType" in item
          && "id" in item
          && "title" in item
          && "href" in item
          && "updatedAt" in item
          && "lastOpenedAt" in item,
      );
    })
    .sort(
      (left, right) =>
        new Date(right.lastOpenedAt).getTime()
        - new Date(left.lastOpenedAt).getTime(),
    );
}

function writeStoredRecentRecords(
  clientId: string,
  records: StoredRecentSearchRecord[],
) {
  if (!canUseStorage()) {
    return;
  }

  writeVersionedJSON(
    getStorageKey(clientId),
    globalSearchRecentsStorageVersion,
    records,
  );
}

export function trackRecentSearchRecord(
  clientId: string | null | undefined,
  record: GlobalSearchRecord,
) {
  if (!clientId) {
    return;
  }

  const nextRecord: StoredRecentSearchRecord = {
    ...record,
    lastOpenedAt: new Date().toISOString(),
  };

  const existingRecords = readStoredRecentRecords(clientId).filter(
    (item) => item.entityType !== record.entityType || item.id !== record.id,
  );

  writeStoredRecentRecords(clientId, [
    nextRecord,
    ...existingRecords,
  ].slice(0, idleResultLimit));

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("global-search-recents-updated", {
        detail: { clientId },
      }),
    );
  }
}

function storedToLiveRecord(
  record: StoredRecentSearchRecord,
): GlobalSearchRecord {
  return {
    entityType: record.entityType,
    id: record.id,
    key: `${record.entityType}:${record.id}`,
    title: record.title,
    subtitle: record.subtitle,
    meta: record.meta,
    badgeLabel: record.badgeLabel,
    href: record.href,
    imageUrl: record.imageUrl,
    updatedAt: record.updatedAt,
  };
}

function scoreFieldMatch(fieldValue: string, searchText: string) {
  if (!fieldValue || !searchText) {
    return 0;
  }

  if (fieldValue === searchText) {
    return 140;
  }

  if (fieldValue.startsWith(searchText)) {
    return 100;
  }

  if (fieldValue.includes(` ${searchText}`)) {
    return 80;
  }

  if (fieldValue.includes(searchText)) {
    return 50;
  }

  return 0;
}

function computeResultScore(record: GlobalSearchRecord, rawQuery: string) {
  const normalizedQuery = normalizeSearchText(rawQuery);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);

  const titleValue = normalizeSearchText(record.title);
  const subtitleValue = normalizeSearchText(record.subtitle);
  const metaValue = normalizeSearchText(record.meta);

  let score = entityPriorityRank[record.entityType] * 10;

  for (const term of terms) {
    score += scoreFieldMatch(titleValue, term) * 5;
    score += scoreFieldMatch(subtitleValue, term) * 3;
    score += scoreFieldMatch(metaValue, term) * 2;
  }

  if (titleValue.startsWith(normalizedQuery)) {
    score += 120;
  }

  if (subtitleValue.startsWith(normalizedQuery)) {
    score += 45;
  }

  return score;
}

function sortByUpdatedAtDesc<T extends { updatedAt: string }>(
  left: T,
  right: T,
) {
  return (
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
}

function sortRankedResults(
  left: GlobalSearchRecord,
  right: GlobalSearchRecord,
  rawQuery: string,
) {
  const leftScore = computeResultScore(left, rawQuery);
  const rightScore = computeResultScore(right, rawQuery);

  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  const updatedAtDelta = sortByUpdatedAtDesc(left, right);
  if (updatedAtDelta !== 0) {
    return updatedAtDelta;
  }

  const priorityDelta =
    entityPriorityRank[right.entityType] - entityPriorityRank[left.entityType];

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return left.title.localeCompare(right.title);
}

function dedupeRecords(records: GlobalSearchRecord[]) {
  const seenKeys = new Set<string>();

  return records.filter((record) => {
    if (seenKeys.has(record.key)) {
      return false;
    }

    seenKeys.add(record.key);
    return true;
  });
}

async function fetchCompanyRecords(query: string | null) {
  let request = supabase
    .from("companies")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(
      query ? perEntitySearchLimit : perEntityIdleLimit.company,
    );

  if (query) {
    request = request.or(
      buildSearchExpression(query, [
        "name",
        "website",
        "email",
        "phone",
        "address",
      ]),
    );
  }

  const { data, error } = await request;

  if (error) {
    throw error;
  }

  return (data ?? []).map((company) =>
    makeRecord(
      "company",
      company.company_id,
      company.name,
      formatWebsiteLabel(company.website) ?? company.email ?? company.address,
      company.industry ? formatCrmEnumLabel(company.industry) : null,
      company.updated_at,
      getCompanyLogoUrl(company.website),
    ),
  );
}

async function fetchContactRecords(query: string | null) {
  let request = supabase
    .from("contacts")
    .select("*, companies!contacts_company_id_fkey(company_id, name, website)")
    .order("updated_at", { ascending: false })
    .limit(
      query ? perEntitySearchLimit : perEntityIdleLimit.contact,
    );

  if (query) {
    request = request.or(
      buildSearchExpression(query, [
        "first_name",
        "last_name",
        "email",
        "phone",
      ]),
    );
  }

  const { data, error } = await request;

  if (error) {
    throw error;
  }

  return (data ?? []).map((contact) =>
    makeRecord(
      "contact",
      contact.contact_id,
      formatContactFullName(contact),
      contact.companies?.name ?? contact.email ?? contact.phone,
      contact.email && contact.companies?.name ? contact.email : formatCrmEnumLabel(contact.type),
      contact.updated_at,
      getCompanyLogoUrl(contact.companies?.website ?? null),
    ),
  );
}

async function fetchDealRecords(query: string | null) {
  let request = supabase
    .from("deals")
    .select(
      "*, companies!deals_company_id_fkey(company_id, name, website), deal_contacts!deal_contacts_deal_id_fkey(contact_id, is_primary, contacts!deal_contacts_contact_id_fkey(first_name, last_name))",
    )
    .order("updated_at", { ascending: false })
    .limit(
      query ? perEntitySearchLimit : perEntityIdleLimit.deal,
    );

  if (query) {
    request = request.or(buildSearchExpression(query, ["address"]));
  }

  const { data, error } = await request;

  if (error) {
    throw error;
  }

  return (data ?? []).map((deal) => {
    const primaryContact =
      deal.deal_contacts?.find(
        (dealContact: { is_primary?: boolean }) => dealContact.is_primary,
      ) ?? deal.deal_contacts?.[0];

    const primaryContactName = primaryContact?.contacts
      ? formatContactFullName(primaryContact.contacts)
      : null;

    return makeRecord(
      "deal",
      deal.deal_id,
      deal.address,
      deal.companies?.name ?? primaryContactName ?? formatDealStageLabel(deal.stage),
      deal.amount ? `${formatDealStageLabel(deal.stage)} · ${formatCompactCurrency(deal.amount)}` : formatDealStageLabel(deal.stage),
      deal.updated_at,
      getCompanyLogoUrl(deal.companies?.website ?? null),
    );
  });
}

async function fetchTaskRecords(query: string | null) {
  let request = supabase
    .from("crm_tasks")
    .select(
      "*, contacts!crm_tasks_contact_id_fkey(first_name, last_name), deals!crm_tasks_deal_id_fkey(address)",
    )
    .order("updated_at", { ascending: false })
    .limit(query ? perEntitySearchLimit : perEntityIdleLimit.task);

  if (query) {
    request = request.or(buildSearchExpression(query, ["title", "description"]));
  }

  const { data, error } = await request;

  if (error) {
    throw error;
  }

  return (data ?? []).map((task) =>
    makeRecord(
      "task",
      task.task_id,
      task.title,
      task.deals?.address
        ?? (task.contacts ? formatContactFullName(task.contacts) : null),
      task.due_date ? `${formatCrmEnumLabel(task.status)} · Due ${formatCrmDate(task.due_date)}` : formatCrmEnumLabel(task.status),
      task.updated_at,
    ),
  );
}

async function fetchThreadRecords(
  clientId: string,
  query: string | null,
) {
  let request = supabase
    .from("conversation_threads")
    .select("thread_id, title, updated_at")
    .eq("client_id", clientId)
    .eq("is_archived", false)
    .eq("is_primary", false)
    .order("updated_at", { ascending: false })
    .limit(query ? perEntitySearchLimit : perEntityIdleLimit.thread);

  if (query) {
    request = request.ilike("title", buildIlikePattern(query));
  }

  const { data, error } = await request;

  if (error) {
    throw error;
  }

  return (data ?? []).map((thread) =>
    makeRecord(
      "thread",
      thread.thread_id,
      thread.title ?? "Untitled thread",
      "Chat thread",
      `Updated ${formatCrmDate(thread.updated_at)}`,
      thread.updated_at,
    ),
  );
}

async function fetchDefaultIdleRecords() {
  const [
    companies,
    contacts,
    deals,
  ] = await Promise.all([
    fetchCompanyRecords(null),
    fetchContactRecords(null),
    fetchDealRecords(null),
  ]);

  return dedupeRecords([
    ...companies,
    ...contacts,
    ...deals,
  ])
    .sort((left, right) => {
      const priorityDelta =
        idleEntityPriorityRank[right.entityType] - idleEntityPriorityRank[left.entityType];

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const updatedAtDelta = sortByUpdatedAtDesc(left, right);
      if (updatedAtDelta !== 0) {
        return updatedAtDelta;
      }

      return left.title.localeCompare(right.title);
    })
    .slice(0, idleResultLimit);
}

async function fetchRankedSearchRecords(
  clientId: string,
  query: string,
) {
  const [
    companies,
    contacts,
    deals,
    tasks,
    threads,
  ] = await Promise.all([
    fetchCompanyRecords(query),
    fetchContactRecords(query),
    fetchDealRecords(query),
    fetchTaskRecords(query),
    fetchThreadRecords(clientId, query),
  ]);

  return dedupeRecords([
    ...companies,
    ...contacts,
    ...deals,
    ...tasks,
    ...threads,
  ])
    .sort((left, right) => sortRankedResults(left, right, query))
    .slice(0, searchResultLimit);
}

async function fetchGlobalSearchRecords(
  clientId: string,
  query: string,
) {
  const normalizedQuery = query.trim();

  if (normalizedQuery.length > 0) {
    return fetchRankedSearchRecords(clientId, normalizedQuery);
  }

  const storedRecentRecords = readStoredRecentRecords(clientId).map(
    storedToLiveRecord,
  );

  if (storedRecentRecords.length >= idleResultLimit) {
    return storedRecentRecords.slice(0, idleResultLimit);
  }

  const defaultRecords = await fetchDefaultIdleRecords();
  return dedupeRecords([...storedRecentRecords, ...defaultRecords]).slice(
    0,
    idleResultLimit,
  );
}

export function useGlobalSearchRecords({
  open,
  query,
}: UseGlobalSearchRecordsOptions) {
  const { data: clientId } = useClientId();

  return useQuery({
    queryKey: ["global-search", clientId ?? "", query.trim()],
    queryFn: async () => {
      if (!clientId) {
        return [] as GlobalSearchRecord[];
      }

      return fetchGlobalSearchRecords(clientId, query);
    },
    enabled: Boolean(open && clientId),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}
