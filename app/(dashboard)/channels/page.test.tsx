/**
 * Tests for the dashboard Channels roadmap page.
 * @module app/(dashboard)/channels/page.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ChannelsPage from "./page";

describe("ChannelsPage", () => {
  it("shows Telegram and WhatsApp as coming soon without connect actions", () => {
    render(<ChannelsPage />);

    expect(screen.getByRole("heading", { name: "Channels" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Telegram" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "WhatsApp" })).toBeInTheDocument();
    expect(screen.getAllByText("Coming soon")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /connect/i })).not.toBeInTheDocument();
  });
});
