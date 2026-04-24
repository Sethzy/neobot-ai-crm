/**
 * Mutation hook for persisting config-driven CRM list column widths.
 *
 * Widths live on the existing `crm_config` field arrays, so this hook only
 * patches the relevant field definition list and keeps the `crm-config` query
 * cache optimistic while the request is in flight.
 *
 * @module hooks/use-update-field-width
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { RESIZE_MIN_WIDTH } from "@/lib/crm/column-widths";
import { CRM_DEFAULTS, type CrmVocabConfig } from "@/lib/crm/config";
import type { FieldDefinition } from "@/lib/crm/field-definitions";

import { crmConfigKeys, type CrmConfigResponse } from "./use-crm-config";

const fieldKeyByEntity = {
  contacts: "contact_fields",
  companies: "company_fields",
  deals: "deal_fields",
} as const;

type ResizableCrmEntity = keyof typeof fieldKeyByEntity;
type FieldArrayKey = (typeof fieldKeyByEntity)[ResizableCrmEntity];

export interface UpdateFieldWidthInput {
  columnId: string;
  width: number;
}

interface UpdateFieldWidthContext {
  previousResponse?: CrmConfigResponse;
}

function normalizeWidth(width: number): number {
  return Math.max(RESIZE_MIN_WIDTH, Math.round(width));
}

function updateFieldArrayWidth(
  fields: FieldDefinition[],
  columnId: string,
  width: number,
) {
  let didChange = false;

  const nextFields = fields.map((field) => {
    if (field.key !== columnId || field.width === width) {
      return field;
    }

    didChange = true;
    return {
      ...field,
      width,
    };
  });

  return {
    didChange,
    nextFields,
  };
}

function buildNextConfig(
  config: CrmVocabConfig,
  entity: ResizableCrmEntity,
  columnId: string,
  width: number,
) {
  const fieldKey = fieldKeyByEntity[entity];
  const normalizedWidth = normalizeWidth(width);
  const { didChange, nextFields } = updateFieldArrayWidth(
    config[fieldKey],
    columnId,
    normalizedWidth,
  );

  return {
    didChange,
    fieldKey,
    nextConfig: didChange
      ? {
          ...config,
          [fieldKey]: nextFields,
        }
      : config,
  };
}

/**
 * Returns a mutation that updates one config-backed column width for the given
 * CRM entity.
 */
export function useUpdateFieldWidth(entity: ResizableCrmEntity) {
  const queryClient = useQueryClient();

  return useMutation<CrmConfigResponse, Error, UpdateFieldWidthInput, UpdateFieldWidthContext>({
    mutationFn: async ({ columnId, width }) => {
      const cachedResponse = queryClient.getQueryData<CrmConfigResponse>(crmConfigKeys.current());
      const baseConfig = cachedResponse?.config ?? CRM_DEFAULTS;
      const { fieldKey, nextConfig } = buildNextConfig(
        baseConfig,
        entity,
        columnId,
        width,
      );

      const response = await fetch("/api/crm/config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          [fieldKey]: nextConfig[fieldKey],
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to update CRM config.");
      }

      return response.json() as Promise<CrmConfigResponse>;
    },
    onMutate: async ({ columnId, width }) => {
      await queryClient.cancelQueries({ queryKey: crmConfigKeys.current() });

      const previousResponse = queryClient.getQueryData<CrmConfigResponse>(crmConfigKeys.current());

      if (!previousResponse) {
        return { previousResponse };
      }

      const { didChange, nextConfig } = buildNextConfig(
        previousResponse.config,
        entity,
        columnId,
        width,
      );

      if (didChange) {
        queryClient.setQueryData<CrmConfigResponse>(crmConfigKeys.current(), {
          ...previousResponse,
          config: nextConfig,
        });
      }

      return { previousResponse };
    },
    onError: (_error, _variables, context) => {
      if (!context?.previousResponse) {
        return;
      }

      queryClient.setQueryData(crmConfigKeys.current(), context.previousResponse);
    },
    onSuccess: (response) => {
      queryClient.setQueryData(crmConfigKeys.current(), response);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: crmConfigKeys.current() });
    },
  });
}

export type { FieldArrayKey, ResizableCrmEntity };
