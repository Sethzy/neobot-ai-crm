/**
 * TanStack Query hooks for case CRUD operations.
 * @module hooks/use-cases
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  queryOptions,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  Case,
  CreateCaseInput,
  UpdateCaseInput,
  CasesFilter,
} from "@/types/cases";

/**
 * Query key factory for cases.
 * Provides consistent keys for caching and invalidation.
 */
export const caseKeys = {
  all: ["cases"] as const,
  lists: () => [...caseKeys.all, "list"] as const,
  list: (filters: { filter: CasesFilter; search?: string }) =>
    [...caseKeys.lists(), filters] as const,
  details: () => [...caseKeys.all, "detail"] as const,
  detail: (id: string) => [...caseKeys.details(), id] as const,
};

/**
 * Query options factory for fetching a single case.
 * Use with queryClient.ensureQueryData() in route loaders.
 */
export function caseDetailQueryOptions(caseId: string) {
  return queryOptions({
    queryKey: caseKeys.detail(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("id", caseId)
        .single();
      if (error) throw error;
      return data as Case;
    },
  });
}

interface UseCasesOptions {
  filter: CasesFilter;
  search?: string;
}

/**
 * Fetches cases from the database with optional filtering.
 * Extracted for reuse in both queryOptions and useQuery.
 */
async function fetchCases({ filter, search }: UseCasesOptions): Promise<Case[]> {
  let query = supabase
    .from("cases")
    .select("*")
    .order("updated_at", { ascending: false });

  // Filter by current user if "mine"
  if (filter === "mine") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      query = query.eq("created_by", user.id);
    }
  }

  // Search by case_name (substring) or case_ref (prefix)
  if (search) {
    query = query.or(
      `case_name.ilike.%${search}%,case_ref.ilike.${search}%`
    );
  }

  const { data, error } = await query;

  if (error) throw error;
  return data as Case[];
}

/**
 * Query options factory for fetching cases list.
 * Use with queryClient.ensureQueryData() in route loaders.
 */
export function casesQueryOptions(params: UseCasesOptions) {
  return queryOptions({
    queryKey: caseKeys.list({ filter: params.filter, search: params.search }),
    queryFn: () => fetchCases(params),
  });
}

/**
 * Fetches all cases with optional filtering.
 * @param options - Filter and search options
 * @returns Query result with cases array
 */
export function useCases({ filter, search }: UseCasesOptions) {
  return useQuery({
    ...casesQueryOptions({ filter, search }),
    placeholderData: keepPreviousData,
  });
}

/**
 * Fetches a single case by ID.
 * @param caseId - The case UUID
 * @returns Query result with case object
 */
export function useCase(caseId: string) {
  return useQuery({
    ...caseDetailQueryOptions(caseId),
    placeholderData: keepPreviousData,
    enabled: !!caseId,
  });
}

/**
 * Creates a new case.
 * @returns Mutation for creating a case
 */
export function useCreateCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCaseInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("cases")
        .insert({
          ...input,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        // Handle unique constraint violation
        if (error.code === "23505") {
          throw new Error("Case reference already exists");
        }
        throw error;
      }
      return data as Case;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: caseKeys.lists() });
    },
  });
}

/**
 * Updates an existing case.
 * @returns Mutation for updating a case
 */
export function useUpdateCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateCaseInput & { id: string }) => {
      const { data, error } = await supabase
        .from("cases")
        .update(input)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        // Handle unique constraint violation
        if (error.code === "23505") {
          throw new Error("Case reference already exists");
        }
        throw error;
      }
      return data as Case;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: caseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: caseKeys.detail(data.id) });
    },
  });
}
