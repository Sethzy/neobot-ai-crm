/**
 * Tests for the DisabledChannelRow stub variant.
 * @module components/settings/messaging-channels/disabled-channel-row.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DisabledChannelRow } from "../disabled-channel-row";

describe("DisabledChannelRow", () => {
  it("renders title, description, and a disabled 'Coming soon' button", () => {
    render(
      <DisabledChannelRow
        icon="chat"
        title="Slack"
        description="Message your agent from any Slack workspace."
      />,
    );

    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(screen.getByText("Message your agent from any Slack workspace.")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: "Coming soon" });
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });
});
