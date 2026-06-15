/**
 * Date-grouped meetings list.
 * @module components/meetings/meetings-list
 */
"use client";

import type { MeetingRecord } from "@/hooks/use-meetings";

import { MeetingRow } from "./meeting-row";

interface MeetingsListProps {
  meetings: MeetingRecord[];
}

function toLocalDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = (value.getMonth() + 1).toString().padStart(2, "0");
  const day = value.getDate().toString().padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function groupByDate(meetings: MeetingRecord[]): Map<string, MeetingRecord[]> {
  const groups = new Map<string, MeetingRecord[]>();
  const now = new Date();
  const todayString = toLocalDateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayString = toLocalDateKey(yesterday);

  for (const meeting of meetings) {
    const meetingDate = new Date(meeting.created_at);
    const dateString = toLocalDateKey(meetingDate);
    let label: string;

    if (dateString === todayString) {
      label = "Today";
    } else if (dateString === yesterdayString) {
      label = "Yesterday";
    } else {
      label = meetingDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    const existingMeetings = groups.get(label) ?? [];
    existingMeetings.push(meeting);
    groups.set(label, existingMeetings);
  }

  return groups;
}

export function MeetingsList({ meetings }: MeetingsListProps) {
  if (meetings.length === 0) {
    return (
      <div className="surface-app flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <p className="type-empty-title">No meetings yet</p>
        <p className="mt-1 type-empty-copy">Record a meeting to keep notes, decisions, and follow-ups in Sunder.</p>
      </div>
    );
  }

  const groupedMeetings = groupByDate(meetings);

  return (
    <div className="space-y-4">
      {Array.from(groupedMeetings.entries()).map(([label, groupedRows]) => (
        <section key={label}>
          <h2 className="mb-2 px-1 type-table-heading text-muted-foreground/60">{label}</h2>
          <div className="surface-app divide-y divide-app-border-subtle/70 overflow-hidden p-1">
            {groupedRows.map((meeting) => (
              <MeetingRow key={meeting.meeting_record_id} meeting={meeting} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
