/**
 * Tests for the ChannelRow primitive.
 * @module components/settings/messaging-channels/channel-row.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChannelRow } from "../channel-row";

describe("ChannelRow", () => {
  it("renders title, description, and action", () => {
    render(
      <ChannelRow
        icon="send"
        title="Telegram"
        description="Message from your phone."
        action={<button>Connect</button>}
      />,
    );

    expect(screen.getByText("Telegram")).toBeInTheDocument();
    expect(screen.getByText("Message from your phone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("renders optional body content below the header", () => {
    render(
      <ChannelRow
        icon="send"
        title="Telegram"
        action={<button>Connect</button>}
      >
        <p>Extra body text.</p>
      </ChannelRow>,
    );

    expect(screen.getByText("Extra body text.")).toBeInTheDocument();
  });

  it("renders without description when not provided", () => {
    render(
      <ChannelRow icon="send" title="Slack" action={<button>Connect</button>} />,
    );

    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(screen.queryByText(/Message from/)).not.toBeInTheDocument();
  });
});
