/**
 * Smoke test for the admin scores dashboard page.
 * @module app/(dashboard)/admin/scores/page.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/scores-query", () => ({
  fetchRecentScores: vi.fn().mockResolvedValue([
    {
      day: "2026-04-09",
      evaluator_name: "safety-gate",
      score_type: "boolean",
      avg_score: 0.95,
      run_count: 20,
    },
  ]),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { email: "limzheyi1996@gmail.com" } },
      }),
    },
  }),
}));

import ScoresPage from "./page";

describe("ScoresPage", () => {
  it("renders the score rows", async () => {
    render(await ScoresPage());

    expect(screen.getByText("safety-gate")).toBeInTheDocument();
    expect(screen.getByText("95.0%")).toBeInTheDocument();
  });
});
