/**
 * Shared message quota RPC wrappers and formatting helpers.
 * @module lib/usage/message-quota
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { BillingPlanName } from "@/lib/stripe/plans";
import type { Database } from "@/types/database";

type QuotaSupabaseClient = Pick<SupabaseClient<Database>, "rpc">;

export const messageQuotaErrorCodes = {
  limitReached: "message-quota-exceeded",
  loadFailed: "message-quota-load-failed",
} as const;

type MessageQuotaErrorCode =
  (typeof messageQuotaErrorCodes)[keyof typeof messageQuotaErrorCodes];

interface MessageQuotaStatusRow {
  client_id: string;
  plan_name: string;
  monthly_message_limit: number;
  messages_used: number;
  messages_remaining: number;
  period_start: string;
  next_reset_date: string;
}

interface ConsumeMessageQuotaRow extends MessageQuotaStatusRow {
  allowed: boolean;
}

interface ReleaseMessageQuotaRow {
  released: boolean;
}

export interface MessageQuotaStatus {
  clientId: string;
  planName: BillingPlanName;
  monthlyMessageLimit: number;
  messagesUsed: number;
  messagesRemaining: number;
  periodStart: string;
  nextResetDate: string;
}

export interface ConsumedMessageQuota extends MessageQuotaStatus {
  allowed: boolean;
}

export class MessageQuotaError extends Error {
  code: MessageQuotaErrorCode;
  quota: MessageQuotaStatus | ConsumedMessageQuota | null;

  constructor(
    code: MessageQuotaErrorCode,
    message: string,
    options?: { quota?: MessageQuotaStatus | ConsumedMessageQuota | null },
  ) {
    super(message);
    this.name = "MessageQuotaError";
    this.code = code;
    this.quota = options?.quota ?? null;
  }
}

function normalizePlanName(planName: string): BillingPlanName {
  if (planName === "Pro" || planName === "Max") {
    return planName;
  }

  return "Free";
}

function mapQuotaStatusRow(row: MessageQuotaStatusRow): MessageQuotaStatus {
  return {
    clientId: row.client_id,
    planName: normalizePlanName(row.plan_name),
    monthlyMessageLimit: row.monthly_message_limit,
    messagesUsed: row.messages_used,
    messagesRemaining: row.messages_remaining,
    periodStart: row.period_start,
    nextResetDate: row.next_reset_date,
  };
}

function mapConsumedQuotaRow(row: ConsumeMessageQuotaRow): ConsumedMessageQuota {
  return {
    allowed: row.allowed,
    ...mapQuotaStatusRow(row),
  };
}

function extractSingleQuotaRow<TRow extends MessageQuotaStatusRow>(
  data: TRow[] | null,
): TRow {
  const row = data?.[0];

  if (!row) {
    throw new MessageQuotaError(
      messageQuotaErrorCodes.loadFailed,
      "Message quota state is unavailable.",
    );
  }

  return row;
}

export async function getMessageQuotaStatus(
  supabase: QuotaSupabaseClient,
  clientId: string,
): Promise<MessageQuotaStatus> {
  const { data, error } = await supabase.rpc("get_message_quota_status", {
    p_client_id: clientId,
  });

  if (error) {
    throw new MessageQuotaError(messageQuotaErrorCodes.loadFailed, error.message);
  }

  return mapQuotaStatusRow(
    extractSingleQuotaRow(data as MessageQuotaStatusRow[] | null),
  );
}

export async function consumeMessageQuota(
  supabase: QuotaSupabaseClient,
  clientId: string,
): Promise<ConsumedMessageQuota> {
  const { data, error } = await supabase.rpc("consume_message_quota", {
    p_client_id: clientId,
  });

  if (error) {
    throw new MessageQuotaError(messageQuotaErrorCodes.loadFailed, error.message);
  }

  return mapConsumedQuotaRow(
    extractSingleQuotaRow(data as ConsumeMessageQuotaRow[] | null),
  );
}

export async function releaseMessageQuota(
  supabase: QuotaSupabaseClient,
  clientId: string,
  periodStart: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("release_message_quota", {
    p_client_id: clientId,
    p_period_start: periodStart,
  });

  if (error) {
    throw new MessageQuotaError(messageQuotaErrorCodes.loadFailed, error.message);
  }

  const row = (data as ReleaseMessageQuotaRow[] | null)?.[0];

  if (!row) {
    throw new MessageQuotaError(
      messageQuotaErrorCodes.loadFailed,
      "Message quota state is unavailable.",
    );
  }

  return row.released;
}

export function formatMessageQuotaResetDate(nextResetDate: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).format(new Date(`${nextResetDate}T00:00:00+08:00`));
}

export function isMessageQuotaError(error: unknown): error is MessageQuotaError {
  return error instanceof MessageQuotaError;
}
