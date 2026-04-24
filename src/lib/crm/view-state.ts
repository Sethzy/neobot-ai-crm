/**
 * Saved CRM workspace state helpers.
 * @module lib/crm/view-state
 */
import { z } from "zod";

import {
  ENTITY_ALLOWED_COLUMNS,
  type ViewFilters,
  viewFiltersSchema,
} from "@/lib/crm/view-filters";

/** Supported saved workspace layouts. */
export const crmViewTypeValues = ["table", "kanban", "calendar"] as const;
export type CrmViewType = (typeof crmViewTypeValues)[number];

/** Supported record-open behaviors for CRM list surfaces. */
export const crmViewOpenModeValues = ["drawer", "page"] as const;
export type CrmViewOpenMode = (typeof crmViewOpenModeValues)[number];

/** Shared CRM saved-view sort contract. */
export const crmViewSortSchema = z.object({
  column: z.string().min(1),
  ascending: z.boolean(),
});

export type CrmViewSort = z.infer<typeof crmViewSortSchema>;

/** Stored workspace state for one CRM saved view. */
export const crmViewStateSchema = z.object({
  version: z.literal(1).default(1),
  viewType: z.enum(crmViewTypeValues).default("table"),
  filters: viewFiltersSchema.default({}),
  sort: crmViewSortSchema.nullable().default(null),
  columns: z.array(z.string().min(1)).default([]),
  columnOrder: z.array(z.string().min(1)).default([]),
  groupBy: z.string().min(1).nullable().default(null),
  calendarField: z.string().min(1).nullable().default(null),
  openMode: z.enum(crmViewOpenModeValues).default("drawer"),
  isDefault: z.boolean().default(false),
});

/**
 * Partial payload accepted when callers patch only part of the saved workspace state.
 * `.strict()` so unknown keys (e.g. snake_case hallucinations like `open_as`) fail loudly
 * instead of being silently stripped.
 */
export const crmViewStatePatchSchema = z
  .object({
    version: z.literal(1).optional(),
    viewType: z.enum(crmViewTypeValues).optional(),
    filters: viewFiltersSchema.optional(),
    sort: crmViewSortSchema.nullable().optional(),
    columns: z.array(z.string().min(1)).optional(),
    columnOrder: z.array(z.string().min(1)).optional(),
    groupBy: z.string().min(1).nullable().optional(),
    calendarField: z.string().min(1).nullable().optional(),
    openMode: z.enum(crmViewOpenModeValues).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export type CrmViewState = z.infer<typeof crmViewStateSchema>;
export type CrmViewStatePatch = z.infer<typeof crmViewStatePatchSchema>;

interface CrmViewRow {
  entity_type: string;
  state?: unknown;
}

interface NormalizeCrmViewStateInput {
  entityType: string;
  state?: unknown;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const nextValue = entry.trim();
    if (nextValue.length === 0 || seen.has(nextValue)) {
      continue;
    }

    seen.add(nextValue);
    normalized.push(nextValue);
  }

  return normalized;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizeFilters(value: unknown): ViewFilters {
  const parsed = viewFiltersSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function normalizeSort(value: unknown): CrmViewSort | null {
  const parsed = crmViewSortSchema.nullable().safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeStatePatch(state: unknown): CrmViewStatePatch {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return {};
  }

  const rawState = state as Record<string, unknown>;
  const normalizedState: CrmViewStatePatch = {};

  const version = z.literal(1).safeParse(rawState.version);
  if (version.success) {
    normalizedState.version = version.data;
  }

  const viewType = z.enum(crmViewTypeValues).safeParse(rawState.viewType);
  if (viewType.success) {
    normalizedState.viewType = viewType.data;
  }

  if (rawState.filters !== undefined) {
    normalizedState.filters = normalizeFilters(rawState.filters);
  }

  if (rawState.sort !== undefined) {
    normalizedState.sort = normalizeSort(rawState.sort);
  }

  if (rawState.columns !== undefined) {
    normalizedState.columns = normalizeStringList(rawState.columns);
  }

  if (rawState.columnOrder !== undefined) {
    normalizedState.columnOrder = normalizeStringList(rawState.columnOrder);
  }

  if (rawState.groupBy !== undefined) {
    normalizedState.groupBy = normalizeNullableString(rawState.groupBy);
  }

  if (rawState.calendarField !== undefined) {
    normalizedState.calendarField = normalizeNullableString(rawState.calendarField);
  }

  const openMode = z.enum(crmViewOpenModeValues).safeParse(rawState.openMode);
  if (openMode.success) {
    normalizedState.openMode = openMode.data;
  }

  const isDefault = z.boolean().safeParse(rawState.isDefault);
  if (isDefault.success) {
    normalizedState.isDefault = isDefault.data;
  }

  return normalizedState;
}

function sanitizeStateForEntity(
  entityType: string,
  state: CrmViewState,
): CrmViewState {
  const allowed = ENTITY_ALLOWED_COLUMNS[entityType];

  if (!allowed) {
    return state;
  }

  const filters = Object.fromEntries(
    Object.entries(state.filters).filter(([key]) => allowed.filterKeys.has(key)),
  );

  const sort =
    state.sort && allowed.sortColumns.has(state.sort.column)
      ? state.sort
      : null;

  return {
    ...state,
    filters,
    sort,
  };
}

/**
 * Normalizes a raw state payload into the current contract.
 *
 * Always returns a safe, fully-defaulted `CrmViewState` — missing or malformed
 * properties fall back to defaults and filter/sort entries that aren't allowed
 * for the entity are stripped.
 */
export function normalizeCrmViewState({
  entityType,
  state,
}: NormalizeCrmViewStateInput): CrmViewState {
  const statePatch = normalizeStatePatch(state);

  const normalizedState = crmViewStateSchema.parse({
    version: 1,
    viewType: statePatch.viewType ?? "table",
    filters: statePatch.filters ?? {},
    sort: statePatch.sort ?? null,
    columns: statePatch.columns ?? [],
    columnOrder: statePatch.columnOrder ?? [],
    groupBy: statePatch.groupBy ?? null,
    calendarField: statePatch.calendarField ?? null,
    openMode: statePatch.openMode ?? "drawer",
    isDefault: statePatch.isDefault ?? false,
  });

  return sanitizeStateForEntity(entityType, normalizedState);
}

/** Returns the view row with its `state` parsed into the current contract. */
export function normalizeCrmView<TView extends CrmViewRow>(
  row: TView,
): Omit<TView, "state"> & { state: CrmViewState } {
  const state = normalizeCrmViewState({
    entityType: row.entity_type,
    state: row.state,
  });

  return { ...row, state };
}
