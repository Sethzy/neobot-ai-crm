/**
 * Saved CRM workspace state helpers.
 * @module lib/crm/view-state
 */
import { z } from "zod";

import {
  ENTITY_ALLOWED_COLUMNS,
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

/** Partial payload accepted when callers patch only part of the saved workspace state. */
export const crmViewStatePatchSchema = z.object({
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
});

export type CrmViewState = z.infer<typeof crmViewStateSchema>;
export type CrmViewStatePatch = z.infer<typeof crmViewStatePatchSchema>;

type LegacyCrmViewRow = {
  client_id: string;
  created_at: string;
  entity_type: string;
  filters?: unknown;
  is_default?: boolean;
  is_seeded: boolean;
  name: string;
  sort?: unknown;
  state?: unknown;
  updated_at: string;
  view_id: string;
};

interface NormalizeCrmViewStateInput {
  entityType: string;
  filters?: unknown;
  isDefault?: boolean;
  sort?: unknown;
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

function normalizeFilters(value: unknown): Record<string, unknown> {
  const parsed = viewFiltersSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function normalizeSort(value: unknown): CrmViewSort | null {
  const parsed = crmViewSortSchema.nullable().safeParse(value);
  return parsed.success ? parsed.data : null;
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
 * Normalizes a raw saved-view row or patch into the current state contract.
 *
 * During rollout we still accept legacy root `filters` / `sort` columns and
 * malformed partial state objects. The helper always returns a safe state.
 */
export function normalizeCrmViewState({
  entityType,
  filters,
  isDefault,
  sort,
  state,
}: NormalizeCrmViewStateInput): CrmViewState {
  const statePatch =
    state && typeof state === "object" && !Array.isArray(state)
      ? crmViewStatePatchSchema.safeParse(state).data ?? {}
      : {};

  const normalizedState = crmViewStateSchema.parse({
    version: 1,
    viewType: statePatch.viewType ?? "table",
    filters:
      statePatch.filters !== undefined
        ? normalizeFilters(statePatch.filters)
        : normalizeFilters(filters),
    sort:
      statePatch.sort !== undefined
        ? normalizeSort(statePatch.sort)
        : normalizeSort(sort),
    columns:
      statePatch.columns !== undefined
        ? normalizeStringList(statePatch.columns)
        : [],
    columnOrder:
      statePatch.columnOrder !== undefined
        ? normalizeStringList(statePatch.columnOrder)
        : [],
    groupBy:
      statePatch.groupBy !== undefined
        ? normalizeNullableString(statePatch.groupBy)
        : null,
    calendarField:
      statePatch.calendarField !== undefined
        ? normalizeNullableString(statePatch.calendarField)
        : null,
    openMode: statePatch.openMode ?? "drawer",
    isDefault:
      statePatch.isDefault !== undefined
        ? statePatch.isDefault
        : Boolean(isDefault),
  });

  return sanitizeStateForEntity(entityType, normalizedState);
}

/**
 * Returns a CRM view row with a normalized `state` object and compatibility
 * aliases for legacy root fields that the rest of the app still reads.
 */
export function normalizeCrmView<TView extends LegacyCrmViewRow>(
  row: TView,
): TView & {
  filters: CrmViewState["filters"];
  is_default: boolean;
  sort: CrmViewState["sort"];
  state: CrmViewState;
} {
  const state = normalizeCrmViewState({
    entityType: row.entity_type,
    state: row.state,
    filters: row.filters,
    sort: row.sort,
    isDefault: row.is_default,
  });

  return {
    ...row,
    filters: state.filters,
    sort: state.sort,
    is_default: state.isDefault,
    state,
  };
}
