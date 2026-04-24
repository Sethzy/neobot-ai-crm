/**
 * Shared helpers for applying committed CRM mutation results to TanStack Query caches.
 * @module hooks/crm-cache-updates
 */
import { type QueryClient, type QueryKey } from "@tanstack/react-query";

interface RowCollection<RecordType> {
  rows: RecordType[];
}

interface RecordCacheSnapshot {
  detail: unknown;
  listEntries: Array<[QueryKey, unknown]>;
}

interface ApplyCommittedRecordPatchParams<RecordType extends Record<string, unknown>> {
  /** Query key for the record detail cache entry. */
  detailKey: QueryKey;
  /** Prefix shared by all list and paginated list query keys for the resource. */
  listKeyPrefix: QueryKey;
  /** Primary key field name on the cached rows. */
  idKey: string;
  /** Primary key value for the record being updated. */
  recordId: string;
  /** Mutation payload already accepted by the backend. */
  updates: Partial<RecordType>;
  /** TanStack Query client used to patch cached records. */
  queryClient: QueryClient;
}

function isRowCollection<RecordType>(value: unknown): value is RowCollection<RecordType> {
  return (
    typeof value === "object"
    && value !== null
    && "rows" in value
    && Array.isArray((value as { rows?: unknown }).rows)
  );
}

function mergeRecordUpdates<RecordType extends Record<string, unknown>>(
  record: RecordType,
  updates: Partial<RecordType>,
): RecordType {
  const nextRecord = {
    ...record,
    ...updates,
  } as RecordType & Record<string, unknown>;

  const nextCustomFields = updates["custom_fields"];
  if (nextCustomFields && typeof nextCustomFields === "object" && !Array.isArray(nextCustomFields)) {
    (nextRecord as Record<string, unknown>)["custom_fields"] = {
      ...((record["custom_fields"] as Record<string, unknown> | null | undefined) ?? {}),
      ...nextCustomFields,
    };
  }

  return nextRecord as RecordType;
}

function patchRecordInCollection<RecordType extends Record<string, unknown>>(
  cachedData: unknown,
  idKey: string,
  recordId: string,
  updates: Partial<RecordType>,
) {
  if (Array.isArray(cachedData)) {
    return cachedData.map((record) => {
      if (typeof record !== "object" || record === null || record[idKey] !== recordId) {
        return record;
      }

      return mergeRecordUpdates(record, updates);
    });
  }

  if (isRowCollection<RecordType>(cachedData)) {
    return {
      ...cachedData,
      rows: cachedData.rows.map((record) =>
        record[idKey] === recordId ? mergeRecordUpdates(record, updates) : record
      ),
    };
  }

  return cachedData;
}

function removeRecordFromCollection<RecordType extends Record<string, unknown>>(
  cachedData: unknown,
  idKey: string,
  recordId: string,
) {
  if (Array.isArray(cachedData)) {
    return cachedData.filter((record) => {
      if (typeof record !== "object" || record === null) {
        return true;
      }

      return record[idKey] !== recordId;
    });
  }

  if (isRowCollection<RecordType>(cachedData)) {
    return {
      ...cachedData,
      rows: cachedData.rows.filter((record) => record[idKey] !== recordId),
    };
  }

  return cachedData;
}

/**
 * Captures the current detail and list cache entries for one CRM record so
 * optimistic mutations can roll back cleanly on error.
 */
export function captureRecordCacheSnapshot({
  detailKey,
  listKeyPrefix,
  queryClient,
}: {
  detailKey: QueryKey;
  listKeyPrefix: QueryKey;
  queryClient: QueryClient;
}): RecordCacheSnapshot {
  return {
    detail: queryClient.getQueryData(detailKey),
    listEntries: queryClient.getQueriesData({ queryKey: listKeyPrefix }),
  };
}

/**
 * Restores a previously captured CRM record cache snapshot.
 */
export function restoreRecordCacheSnapshot({
  detail,
  detailKey,
  listEntries,
  queryClient,
}: RecordCacheSnapshot & {
  detailKey: QueryKey;
  queryClient: QueryClient;
}) {
  if (typeof detail === "undefined") {
    queryClient.removeQueries({ queryKey: detailKey, exact: true });
  } else {
    queryClient.setQueryData(detailKey, detail);
  }

  for (const [queryKey, cachedData] of listEntries) {
    if (typeof cachedData === "undefined") {
      queryClient.removeQueries({ queryKey, exact: true });
      continue;
    }

    queryClient.setQueryData(queryKey, cachedData);
  }
}

/**
 * Applies a successful CRM mutation payload to the matching detail and list caches.
 *
 * The refetch still runs after the patch, but the UI no longer has to wait for it
 * before showing the committed value.
 */
export function applyCommittedRecordPatch<RecordType extends Record<string, unknown>>({
  detailKey,
  listKeyPrefix,
  idKey,
  recordId,
  updates,
  queryClient,
}: ApplyCommittedRecordPatchParams<RecordType>) {
  queryClient.setQueryData(detailKey, (cachedRecord: RecordType | undefined) => {
    if (!cachedRecord) {
      return cachedRecord;
    }

    return mergeRecordUpdates(cachedRecord, updates);
  });

  queryClient.setQueriesData(
    { queryKey: listKeyPrefix },
    (cachedData: unknown) => patchRecordInCollection<RecordType>(cachedData, idKey, recordId, updates),
  );
}

/**
 * Removes one CRM record from the cached detail and list queries immediately.
 */
export function removeCachedRecord<RecordType extends Record<string, unknown>>({
  detailKey,
  listKeyPrefix,
  idKey,
  recordId,
  queryClient,
}: Omit<ApplyCommittedRecordPatchParams<RecordType>, "updates">) {
  queryClient.removeQueries({ queryKey: detailKey, exact: true });

  queryClient.setQueriesData(
    { queryKey: listKeyPrefix },
    (cachedData: unknown) => removeRecordFromCollection<RecordType>(cachedData, idKey, recordId),
  );
}
