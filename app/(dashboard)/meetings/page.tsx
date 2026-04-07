/**
 * Meetings list page.
 * @module app/(dashboard)/meetings/page
 */
"use client";

import { useState } from "react";

import { AppIcon } from "@/components/icons/app-icons";
import { MeetingRecordingView } from "@/components/meetings/meeting-recording-view";
import { MeetingsList } from "@/components/meetings/meetings-list";
import { Button } from "@/components/ui/button";
import { useMeetings } from "@/hooks/use-meetings";

export default function MeetingsPage() {
  const { data: meetings, isLoading } = useMeetings();
  const [isRecording, setIsRecording] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading meetings...</p>
      </div>
    );
  }

  if (isRecording) {
    return <MeetingRecordingView onDone={() => setIsRecording(false)} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Meetings</h1>
        <Button size="sm" onClick={() => setIsRecording(true)}>
          <AppIcon name="meeting" className="mr-1.5 h-4 w-4" />
          New Meeting
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <MeetingsList meetings={meetings ?? []} />
      </div>
    </div>
  );
}
