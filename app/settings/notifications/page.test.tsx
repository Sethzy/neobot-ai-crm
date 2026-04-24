/**
 * Tests for Settings → Notifications.
 * @module app/settings/notifications/page
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NotificationsPage from "./page";

describe("NotificationsPage", () => {
  it("describes automation notifications without the retired autopilot surface", () => {
    render(<NotificationsPage />);

    expect(
      screen.getByRole("heading", { name: "Notifications" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/automation runs and approval requests/i)).toBeInTheDocument();
    expect(screen.queryByText(/autopilot/i)).not.toBeInTheDocument();
  });
});
