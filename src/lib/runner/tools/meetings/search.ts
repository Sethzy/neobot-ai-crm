/**
 * Agent tool for searching past meeting recordings.
 * @module lib/runner/tools/meetings/search
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { AGENT_FILES_BUCKET } from "@/lib/storage/agent-files";
import type { Database } from "@/types/database";

type SearchMeetingRow = Pick<
  Database["public"]["Tables"]["meeting_records"]["Row"],
  | "meeting_record_id"
  | "title"
  | "summary"
  | "duration_seconds"
  | "notes"
  | "created_at"
  | "status"
  | "transcript_path"
>;

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase();
}

function matchesInlineFields(meeting: SearchMeetingRow, normalizedQuery: string): boolean {
  return [meeting.title, meeting.summary, meeting.notes]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

async function transcriptContainsQuery(
  supabase: SupabaseClient<Database>,
  clientId: string,
  transcriptPath: string | null,
  normalizedQuery: string,
): Promise<boolean> {
  if (!transcriptPath) {
    return false;
  }

  const { data, error } = await supabase.storage
    .from(AGENT_FILES_BUCKET)
    .download(`${clientId}/${transcriptPath}`);

  if (error || !data) {
    return false;
  }

  const transcriptText = typeof data === "string"
    ? data
    : await data.text();

  return transcriptText.toLowerCase().includes(normalizedQuery);
}

function serializeMeetingResult(meeting: SearchMeetingRow) {
  const { transcript_path: _transcriptPath, ...result } = meeting;
  return result;
}

function buildMeetingsQuery(
  supabase: SupabaseClient<Database>,
  clientId: string,
  dateFrom?: string,
  dateTo?: string,
  linkedContactId?: string,
  linkedDealId?: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let queryBuilder = (supabase as any)
    .from("meeting_records")
    .select("meeting_record_id, title, summary, duration_seconds, notes, created_at, status, transcript_path")
    .eq("client_id", clientId)
    .eq("status", "completed");

  if (dateFrom) {
    queryBuilder = queryBuilder.gte("created_at", dateFrom);
  }

  if (dateTo) {
    queryBuilder = queryBuilder.lte("created_at", dateTo);
  }

  if (linkedContactId) {
    queryBuilder = queryBuilder.eq("linked_contact_id", linkedContactId);
  }

  if (linkedDealId) {
    queryBuilder = queryBuilder.eq("linked_deal_id", linkedDealId);
  }

  return queryBuilder.order("created_at", { ascending: false });
}

export function createSearchMeetingsTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    search_meetings: tool({
      description:
        "Search past meeting recordings by keyword, date range, or linked CRM record. Returns title, summary, duration, and creation date.",
      inputSchema: z.object({
        query: z.string().optional().describe("Keyword search in title, notes, or summary"),
        dateFrom: z.string().optional().describe("ISO date lower bound (inclusive)"),
        dateTo: z.string().optional().describe("ISO date upper bound (inclusive)"),
        linkedContactId: z.string().uuid().optional().describe("Filter by linked contact"),
        linkedDealId: z.string().uuid().optional().describe("Filter by linked deal"),
        limit: z.number().int().min(1).max(20).optional().default(10),
      }),
      execute: async ({ query, dateFrom, dateTo, linkedContactId, linkedDealId, limit }) => {
        const normalizedQuery = query ? normalizeSearchValue(query) : "";

        if (normalizedQuery.length === 0) {
          const { data, error } = await buildMeetingsQuery(
            supabase,
            clientId,
            dateFrom,
            dateTo,
            linkedContactId,
            linkedDealId,
          ).limit(limit);

          if (error) {
            return { success: false as const, error: error.message };
          }

          return {
            success: true as const,
            entity: ((data ?? []) as SearchMeetingRow[]).map(serializeMeetingResult),
          };
        }

        const matchingRows: SearchMeetingRow[] = [];
        const pageSize = 50;
        let pageIndex = 0;

        while (matchingRows.length < limit) {
          const from = pageIndex * pageSize;
          const to = from + pageSize - 1;
          const { data, error } = await buildMeetingsQuery(
            supabase,
            clientId,
            dateFrom,
            dateTo,
            linkedContactId,
            linkedDealId,
          ).range(from, to);

          if (error) {
            return { success: false as const, error: error.message };
          }

          const rows = (data ?? []) as SearchMeetingRow[];

          if (rows.length === 0) {
            break;
          }

          for (const row of rows) {
            const matchesTranscript = matchesInlineFields(row, normalizedQuery)
              || await transcriptContainsQuery(supabase, clientId, row.transcript_path, normalizedQuery);

            if (!matchesTranscript) {
              continue;
            }

            matchingRows.push(row);

            if (matchingRows.length >= limit) {
              break;
            }
          }

          if (rows.length < pageSize) {
            break;
          }

          pageIndex += 1;
        }

        return {
          success: true as const,
          entity: matchingRows.map(serializeMeetingResult),
        };
      },
    }),
  };
}
