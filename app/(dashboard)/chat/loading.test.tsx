/**
 * Tests for chat loading shell.
 * @module app/(dashboard)/chat/loading.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ChatLoading from "./loading";

describe("chat loading shell", () => {
  it("renders a shell without a spinner", () => {
    const { container } = render(<ChatLoading />);

    expect(screen.getByTestId("chat-loading-shell")).toBeInTheDocument();
    expect(screen.getByTestId("chat-loading-composer-skeleton")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
  });
});
