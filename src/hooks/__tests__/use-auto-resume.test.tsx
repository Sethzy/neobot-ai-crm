/**
 * Tests for auto-resume stream behavior.
 * @module hooks/__tests__/use-auto-resume
 */
import { render } from "@testing-library/react";
import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAutoResume } from "../use-auto-resume";

const mockUseDataStream = vi.fn();
const mockResumeStream = vi.fn();
const mockSetMessages = vi.fn();

vi.mock("@/components/chat/data-stream-provider", () => ({
  useDataStream: () => mockUseDataStream(),
}));

function TestHookComponent({
  autoResume,
  initialMessages,
}: {
  autoResume: boolean;
  initialMessages: UIMessage[];
}) {
  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream: mockResumeStream,
    setMessages: mockSetMessages,
  });
  return null;
}

describe("useAutoResume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls resumeStream once when autoResume is true and most recent message is user", () => {
    mockUseDataStream.mockReturnValue({
      dataStream: [],
      setDataStream: vi.fn(),
    });

    render(
      <TestHookComponent
        autoResume
        initialMessages={[
          { id: "u1", role: "user", parts: [{ type: "text", text: "Resume me" }] } as UIMessage,
        ]}
      />,
    );

    expect(mockResumeStream).toHaveBeenCalledTimes(1);
  });

  it("does not call resumeStream when autoResume is false", () => {
    mockUseDataStream.mockReturnValue({
      dataStream: [],
      setDataStream: vi.fn(),
    });

    render(
      <TestHookComponent
        autoResume={false}
        initialMessages={[
          { id: "u1", role: "user", parts: [{ type: "text", text: "Do not resume" }] } as UIMessage,
        ]}
      />,
    );

    expect(mockResumeStream).not.toHaveBeenCalled();
  });
});
