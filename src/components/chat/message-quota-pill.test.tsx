/**
 * Tests for the chat message quota pill display states.
 * @module components/chat/message-quota-pill.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MessageQuotaPill } from "./message-quota-pill";

const baseQuota = {
  clientId: "client-1",
  planName: "Free" as const,
  monthlyMessageLimit: 100,
  messagesUsed: 12,
  messagesRemaining: 88,
  periodStart: "2026-06-01",
  nextResetDate: "2026-07-01",
};

describe("MessageQuotaPill", () => {
  it("renders normal finite quota usage", () => {
    render(<MessageQuotaPill quota={baseQuota} />);

    expect(screen.getByText("12 / 100 messages")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade plan" })).toHaveAttribute(
      "href",
      "/pricing",
    );
  });

  it("hides internal seeded unlimited limits from customer-facing UI", () => {
    render(
      <MessageQuotaPill
        quota={{
          ...baseQuota,
          monthlyMessageLimit: 999999,
          messagesRemaining: 999987,
        }}
      />,
    );

    expect(screen.getByText("12 messages used")).toBeInTheDocument();
    expect(screen.queryByText(/999999/)).not.toBeInTheDocument();
  });
});
