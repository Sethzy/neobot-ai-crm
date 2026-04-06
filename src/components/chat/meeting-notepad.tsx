/**
 * Plain-text note surface shown while a meeting recording is in progress.
 * @module components/chat/meeting-notepad
 */
"use client";

import { useCallback } from "react";

interface MeetingNotepadProps {
  value: string;
  onChange: (value: string) => void;
  isMobile?: boolean;
}

export function MeetingNotepad({
  value,
  onChange,
  isMobile = false,
}: MeetingNotepadProps) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(event.currentTarget.value);
    },
    [onChange],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
      <textarea
        autoFocus
        className="min-h-0 flex-1 resize-none rounded-lg border border-border/60 bg-background px-4 py-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
        placeholder="Type notes during your meeting..."
        value={value}
        onChange={handleChange}
      />

      {isMobile ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Best for in-person conversations. The recorder only captures audio from your microphone.
        </p>
      ) : null}
    </div>
  );
}
