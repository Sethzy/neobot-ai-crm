/**
 * Tests for ensureClientBootstrap (skills-only, post-D2).
 * @module lib/runner/skills/__tests__/ensure-client-bootstrap
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBootstrapSkills } = vi.hoisted(() => ({
  mockBootstrapSkills: vi.fn(),
}));

vi.mock("../skill-bootstrap", () => ({
  bootstrapSkills: mockBootstrapSkills,
}));

import { ensureClientBootstrap } from "../ensure-client-bootstrap";

function createMockSupabase(
  initialFlag: boolean,
  opts?: { selectError?: { message: string }; updateError?: { message: string } },
) {
  const eqUpdate = vi.fn().mockResolvedValue({ error: opts?.updateError ?? null });
  const update = vi.fn().mockReturnValue({ eq: eqUpdate });
  const single = vi.fn().mockResolvedValue({
    data: opts?.selectError ? null : { is_bootstrapped: initialFlag },
    error: opts?.selectError ?? null,
  });
  const eqSelect = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq: eqSelect });
  const from = vi.fn().mockReturnValue({ select, update });

  return {
    client: { from } as unknown as Parameters<typeof ensureClientBootstrap>[0],
    from,
    select,
    update,
    eqUpdate,
  };
}

beforeEach(() => {
  mockBootstrapSkills.mockReset();
  mockBootstrapSkills.mockResolvedValue(undefined);
});

describe("ensureClientBootstrap", () => {
  it("skips skill bootstrap when is_bootstrapped is true", async () => {
    const mock = createMockSupabase(true);
    await ensureClientBootstrap(mock.client, "client-1");
    expect(mockBootstrapSkills).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("runs skill bootstrap and flips the flag when is_bootstrapped is false", async () => {
    const mock = createMockSupabase(false);
    await ensureClientBootstrap(mock.client, "client-1");
    expect(mockBootstrapSkills).toHaveBeenCalledWith(mock.client, "client-1");
    expect(mock.update).toHaveBeenCalledWith({ is_bootstrapped: true });
  });

  it("throws on a select error", async () => {
    const mock = createMockSupabase(false, { selectError: { message: "db down" } });
    await expect(ensureClientBootstrap(mock.client, "client-1")).rejects.toThrow(/db down/);
  });

  it("throws on an update error after a successful skill bootstrap", async () => {
    const mock = createMockSupabase(false, { updateError: { message: "write failed" } });
    await expect(ensureClientBootstrap(mock.client, "client-1")).rejects.toThrow(/write failed/);
    expect(mockBootstrapSkills).toHaveBeenCalled();
  });
});
