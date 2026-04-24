/**
 * Tests for the meeting detail loading shell.
 * @module components/meetings/__tests__/meeting-detail-loading.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MeetingDetailLoading } from "../meeting-detail-loading";

describe("MeetingDetailLoading", () => {
  it("renders the meeting detail sections and action placeholder", () => {
    render(<MeetingDetailLoading />);

    expect(screen.getByTestId("meeting-detail-loading-shell")).toBeInTheDocument();
    expect(screen.getAllByTestId("meeting-detail-loading-section")).toHaveLength(2);
  });
});
