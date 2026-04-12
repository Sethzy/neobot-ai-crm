import { describe, expect, it, vi } from "vitest";

import { interruptSession } from "../interrupt-session";

describe("interruptSession", () => {
  it("posts a user.interrupt event to the given session id", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const anthropic = {
      beta: { sessions: { events: { send } } },
    } as never;

    await interruptSession(anthropic, "sess_abc");

    expect(send).toHaveBeenCalledWith("sess_abc", {
      events: [{ type: "user.interrupt" }],
    });
  });
});
