/**
 * Tests for chat stream reconnect endpoint.
 * @module lib/ai/__tests__/chat-stream-route
 */
import { describe, expect, it } from "vitest";

import { GET } from "../../../../app/api/chat/[id]/stream/route";

describe("GET /api/chat/[id]/stream", () => {
  it("returns 204 when no resumable stream is available", () => {
    const response = GET();
    expect(response.status).toBe(204);
  });
});
