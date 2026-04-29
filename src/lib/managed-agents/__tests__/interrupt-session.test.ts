import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { interruptSession } from "../interrupt-session";

describe("interruptSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("posts a user.interrupt event to the given session id", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const retrieve = vi.fn().mockResolvedValue({ status: "idle" });
    const archive = vi.fn().mockResolvedValue(undefined);
    const anthropic = {
      beta: { sessions: { events: { send }, retrieve, archive } },
    } as never;

    await interruptSession(anthropic, "sess_abc");

    expect(send).toHaveBeenCalledWith("sess_abc", {
      events: [{ type: "user.interrupt" }],
    });
  });

  it("escalates to archive when the session is still running 5s later", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const retrieve = vi.fn().mockResolvedValue({ status: "running" });
    const archive = vi.fn().mockResolvedValue(undefined);
    const anthropic = {
      beta: { sessions: { events: { send }, retrieve, archive } },
    } as never;

    await interruptSession(anthropic, "sess_xyz");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(retrieve).toHaveBeenCalledWith("sess_xyz");
    expect(archive).toHaveBeenCalledWith("sess_xyz");
  });

  it("does not archive when the session settled within the grace window", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const retrieve = vi.fn().mockResolvedValue({ status: "idle" });
    const archive = vi.fn().mockResolvedValue(undefined);
    const anthropic = {
      beta: { sessions: { events: { send }, retrieve, archive } },
    } as never;

    await interruptSession(anthropic, "sess_clean");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(retrieve).toHaveBeenCalledWith("sess_clean");
    expect(archive).not.toHaveBeenCalled();
  });
});
