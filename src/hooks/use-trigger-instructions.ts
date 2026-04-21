/**
 * Hook for reading and writing automation instruction content through the
 * dashboard API route.
 *
 * @module hooks/use-trigger-instructions
 */
"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { z } from "zod";

const triggerInstructionsResponseSchema = z.object({
  content: z.string(),
  displayPath: z.string(),
});

type TriggerInstructionsResponse = z.infer<typeof triggerInstructionsResponseSchema>;

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function readTriggerInstructions(
  triggerId: string,
): Promise<TriggerInstructionsResponse> {
  const response = await fetch(`/api/automations/${triggerId}/instructions`, {
    method: "GET",
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "Unable to load instructions.";
    throw new Error(message);
  }

  return triggerInstructionsResponseSchema.parse(body);
}

export function prefetchTriggerInstructions(
  queryClient: QueryClient,
  triggerId: string,
  instructionPath: string,
): Promise<void> {
  const queryKey = ["trigger-instructions", triggerId, instructionPath] as const;

  return queryClient.prefetchQuery({
    queryKey,
    queryFn: () => readTriggerInstructions(triggerId),
  });
}

async function writeTriggerInstructions(
  triggerId: string,
  content: string,
): Promise<TriggerInstructionsResponse> {
  const response = await fetch(`/api/automations/${triggerId}/instructions`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "Unable to save instructions.";
    throw new Error(message);
  }

  return triggerInstructionsResponseSchema.parse(body);
}

/**
 * Fetches automation instruction content and exposes a save mutation.
 */
export function useTriggerInstructions(
  triggerId: string | null,
  instructionPath: string | null,
) {
  const queryClient = useQueryClient();
  const queryKey = ["trigger-instructions", triggerId, instructionPath] as const;

  const query = useQuery({
    queryKey,
    queryFn: () => readTriggerInstructions(triggerId!),
    enabled: Boolean(triggerId && instructionPath),
  });

  const mutation = useMutation({
    mutationFn: (content: string) => writeTriggerInstructions(triggerId!, content),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });

  return { ...query, save: mutation };
}
