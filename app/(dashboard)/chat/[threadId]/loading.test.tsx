/**
 * Tests for thread-route loading shell.
 * @module app/(dashboard)/chat/[threadId]/loading.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("chat thread loading shell", () => {
  it("renders message/composer skeletons without spinner", () => {
    const { container } = render(<Loading />);

    expect(screen.getByTestId("chat-thread-loading-shell")).toBeInTheDocument();
    expect(screen.getByTestId("chat-thread-loading-message-skeletons")).toBeInTheDocument();
    expect(screen.getByTestId("chat-thread-loading-composer-skeleton")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
  });
});
