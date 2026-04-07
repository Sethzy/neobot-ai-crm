/**
 * Tests for meeting recorder chat UI primitives.
 * @module components/chat/meeting-recorder-ui.test
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MeetingNotepad } from "./meeting-notepad";
import { RecordingBar } from "./recording-bar";
import { UploadProgress } from "./upload-progress";

describe("RecordingBar", () => {
  it("renders recording state and invokes pause/stop actions", () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onStop = vi.fn();

    render(
      <RecordingBar
        state="recording"
        elapsedSeconds={125}
        onPause={onPause}
        onResume={onResume}
        onStop={onStop}
      />,
    );

    expect(screen.getByText("02:05")).toBeInTheDocument();
    expect(screen.getByText("Recording")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /pause recording/i }));
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));

    expect(onPause).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
    expect(onResume).not.toHaveBeenCalled();
  });

  it("renders paused state and invokes resume", () => {
    const onResume = vi.fn();

    render(
      <RecordingBar
        state="paused"
        elapsedSeconds={5}
        onPause={vi.fn()}
        onResume={onResume}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByText("Paused")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /resume recording/i }));

    expect(onResume).toHaveBeenCalledOnce();
  });

  it("disables controls when the recorder is processing", () => {
    render(
      <RecordingBar
        state="recording"
        elapsedSeconds={5}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        controlsDisabled
        statusLabel="Processing"
      />,
    );

    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pause recording/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /stop recording/i })).toBeDisabled();
  });
});

describe("MeetingNotepad", () => {
  it("renders the textarea and forwards note changes", () => {
    const onChange = vi.fn();

    render(<MeetingNotepad value="" onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText(/type notes during your meeting/i), {
      target: { value: "Follow up Thursday" },
    });

    expect(onChange).toHaveBeenCalledWith("Follow up Thursday");
  });

  it("shows the mobile note when requested", () => {
    render(<MeetingNotepad value="" onChange={vi.fn()} isMobile />);

    expect(screen.getByText(/best for in-person conversations/i)).toBeInTheDocument();
  });
});

describe("UploadProgress", () => {
  it("renders uploading progress details", () => {
    render(
      <UploadProgress
        phase="uploading"
        progress={42}
        durationMinutes={3}
        noteCount={2}
      />,
    );

    expect(screen.getByText(/Uploading recording/i)).toHaveTextContent("Uploading recording... 42%");
    expect(screen.getByText(/3 min recording/i)).toHaveTextContent("3 min recording · 2 notes");
  });

  it("renders an error message", () => {
    render(<UploadProgress phase="error" error="Network down" />);

    expect(screen.getByText(/Upload failed: Network down/i)).toBeInTheDocument();
  });
});
