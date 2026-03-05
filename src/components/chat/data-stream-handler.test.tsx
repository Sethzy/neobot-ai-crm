/**
 * Tests for data stream handler.
 * @module components/chat/data-stream-handler.test
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DataStreamHandler } from "./data-stream-handler";

const mockInvalidateQueries = vi.fn();
const mockUseDataStream = vi.fn();
const mockSetDataStream = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

vi.mock("./data-stream-provider", () => ({
  useDataStream: () => mockUseDataStream(),
}));

describe("DataStreamHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDataStream.mockReturnValue({
      dataStream: [],
      setDataStream: mockSetDataStream,
    });
  });

  it("invalidates thread query cache for data-chat-title and clears processed data parts", () => {
    mockUseDataStream.mockReturnValue({
      dataStream: [{ type: "data-chat-title", data: "Generated title" }],
      setDataStream: mockSetDataStream,
    });

    render(<DataStreamHandler />);

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["threads"] });
    expect(mockSetDataStream).toHaveBeenCalledWith([]);
  });
});
