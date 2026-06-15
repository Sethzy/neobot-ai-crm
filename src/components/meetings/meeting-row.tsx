/**
 * One row in the meetings list.
 * @module components/meetings/meeting-row
 */
"use client";

import Link from "next/link";

import { AppIcon } from "@/components/icons/app-icons";
import type { MeetingRecord } from "@/hooks/use-meetings";

interface MeetingRowProps {
  meeting: MeetingRecord;
}

function formatMeetingDuration(seconds: number | null): string {
  if (!seconds) {
    return "";
  }

  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function formatMeetingTime(isoDate: string): string {
  const date = new Date(isoDate);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const amPm = hours >= 12 ? "p" : "a";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${minutes.toString().padStart(2, "0")}${amPm}`;
}

export function MeetingRow({ meeting }: MeetingRowProps) {
  const title = meeting.title || "Untitled meeting";
  const duration = formatMeetingDuration(meeting.duration_seconds);
  const time = formatMeetingTime(meeting.created_at);

  return (
    <Link
      href={`/meetings/${meeting.meeting_record_id}`}
      className="group flex items-center justify-between rounded-lg px-3 py-3 transition-colors hover:bg-app-hover/80"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <AppIcon name="meeting" className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="type-row-title truncate text-foreground">{title}</span>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-3 type-row-meta text-muted-foreground">
        {duration ? <span>{duration}</span> : null}
        <span>{time}</span>
      </div>
    </Link>
  );
}
