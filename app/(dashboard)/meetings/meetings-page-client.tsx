"use client";

/**
 * Client meetings page body hydrated by the server route.
 * @module app/(dashboard)/meetings/meetings-page-client
 */
import { useState } from "react";

import { AppIcon } from "@/components/icons/app-icons";
import { PageCanvas } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";
import { MeetingsList } from "@/components/meetings/meetings-list";
import { MeetingRecordingView } from "@/components/meetings/meeting-recording-view";
import { Button } from "@/components/ui/button";
import { useMeetings } from "@/hooks/use-meetings";

export function MeetingsPageClient() {
  const { data: meetings, isLoading } = useMeetings();
  const [isRecording, setIsRecording] = useState(false);

  if (isLoading) {
    return (
      <PageCanvas className="items-center justify-center">
        <p className="type-control-muted">Loading meetings...</p>
      </PageCanvas>
    );
  }

  if (isRecording) {
    return <MeetingRecordingView onDone={() => setIsRecording(false)} />;
  }

  return (
    <PageCanvas>
      <PageHeader
        title="Meetings"
        actions={
          <Button size="sm" onClick={() => setIsRecording(true)}>
            <AppIcon name="meeting" className="mr-1.5 h-4 w-4" />
            New Meeting
          </Button>
        }
      />
      <MeetingsList meetings={meetings ?? []} />
    </PageCanvas>
  );
}
