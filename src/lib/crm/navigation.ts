/**
 * CRM detail-route helpers for preserving workspace context in page mode.
 * @module lib/crm/navigation
 */

export const crmReturnHrefParam = "from";
const crmDrawerDetailParam = "detail";

const crmRecordCollectionHrefMap = {
  company: "/customers/companies",
  contact: "/customers/people",
  deal: "/customers/deals",
} as const;

export type CrmPageableRecordObjectType = keyof typeof crmRecordCollectionHrefMap;

type SearchParamsInput =
  | URLSearchParams
  | { toString(): string }
  | string
  | null
  | undefined;

interface GetCrmRecordHrefOptions {
  returnTo?: string | null;
}

/**
 * Returns the base collection route for a CRM record type.
 */
export function getCrmRecordCollectionHref(objectType: CrmPageableRecordObjectType) {
  return crmRecordCollectionHrefMap[objectType];
}

/**
 * Builds the current workspace href from a pathname plus its query string.
 */
export function getCrmWorkspaceHref(
  pathname: string | null | undefined,
  searchParams?: SearchParamsInput,
) {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) {
    return "/";
  }

  const search = typeof searchParams === "string"
    ? searchParams
    : searchParams?.toString() ?? "";

  return search.length > 0 ? `${pathname}?${search}` : pathname;
}

function matchesAllowedCollectionHref(
  objectType: CrmPageableRecordObjectType,
  href: string,
) {
  const collectionHref = getCrmRecordCollectionHref(objectType);

  return href === collectionHref
    || href.startsWith(`${collectionHref}?`)
    || href.startsWith(`${collectionHref}#`);
}

function stripDrawerStateFromCollectionHref(href: string) {
  const parsedHref = new URL(href, "http://localhost");
  parsedHref.searchParams.delete(crmDrawerDetailParam);

  const search = parsedHref.searchParams.toString();
  return `${parsedHref.pathname}${search ? `?${search}` : ""}${parsedHref.hash}`;
}

/**
 * Returns a safe CRM return href for a given record type, or null when invalid.
 */
export function sanitizeCrmReturnHref(
  objectType: CrmPageableRecordObjectType,
  returnTo?: string | null,
) {
  if (typeof returnTo !== "string") {
    return null;
  }

  const trimmedHref = returnTo.trim();
  if (trimmedHref.length === 0) {
    return null;
  }

  if (!matchesAllowedCollectionHref(objectType, trimmedHref)) {
    return null;
  }

  return stripDrawerStateFromCollectionHref(trimmedHref);
}

/**
 * Returns the CRM detail route for a record and optionally encodes a safe
 * return href back to the originating workspace.
 */
export function getCrmRecordHref(
  objectType: CrmPageableRecordObjectType,
  recordId: string,
  options?: GetCrmRecordHrefOptions,
) {
  const detailHref = `${getCrmRecordCollectionHref(objectType)}/${recordId}`;
  const returnTo = sanitizeCrmReturnHref(objectType, options?.returnTo);

  if (!returnTo) {
    return detailHref;
  }

  const searchParams = new URLSearchParams([[crmReturnHrefParam, returnTo]]);
  return `${detailHref}?${searchParams.toString()}`;
}

/**
 * Resolves the correct back href for a CRM detail page.
 */
export function resolveCrmRecordBackHref(
  objectType: CrmPageableRecordObjectType,
  returnTo?: string | null,
) {
  return sanitizeCrmReturnHref(objectType, returnTo)
    ?? getCrmRecordCollectionHref(objectType);
}

/**
 * Collapses a query param that may be repeated into a single string value.
 */
export function getSingleQueryParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" ? value : null;
}
