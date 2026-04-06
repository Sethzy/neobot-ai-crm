/**
 * Tests for meeting follow-up prompt instructions.
 * @module lib/ai/__tests__/meeting-prompt
 */
import { describe, expect, it } from "vitest";

import { buildMeetingInstructions } from "../meeting-prompt";

describe("buildMeetingInstructions", () => {
  it("tells the agent to read the transcript file and use CRM search plus ask_user_question", () => {
    const instructions = buildMeetingInstructions({
      transcriptPath: "home/meetings/2026-04-06-meeting-1234abcd.md",
      notes: "",
      durationMinutes: 42,
    });

    expect(instructions).toContain("42-minute meeting recording");
    expect(instructions).toContain('read_file with path "/agent/home/meetings/2026-04-06-meeting-1234abcd.md"');
    expect(instructions).toContain("Use search_crm to find matches");
    expect(instructions).toContain("Use ask_user_question");
    expect(instructions).toContain("Use write_file");
  });

  it("includes authoritative user notes when provided", () => {
    const instructions = buildMeetingInstructions({
      transcriptPath: "home/meetings/meeting.md",
      notes: "THURSDAY not Friday",
      durationMinutes: 10,
    });

    expect(instructions).toContain("User Notes");
    expect(instructions).toContain("THURSDAY not Friday");
    expect(instructions).toContain("these are authoritative");
  });
});
