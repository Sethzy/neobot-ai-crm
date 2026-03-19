/**
 * Tests for shared CRM display color helpers.
 * @module lib/crm/display.test
 */
import { describe, expect, it } from "vitest";

import { AVATAR_COLORS } from "@/lib/ui/color-maps";

import {
  avatarColorFor,
  getDealStageToneClass,
  getDealStageTopBorderClass,
  taskStatusToneClassMap,
  taskStatusTopBorderMap,
} from "./display";

describe("CRM display color helpers", () => {
  it("returns semantic tone classes for default deal stages", () => {
    expect(getDealStageToneClass("leads")).toBe("bg-stage-leads/10 text-stage-leads");
    expect(getDealStageToneClass("closing")).toBe("bg-stage-closing/10 text-stage-closing");
  });

  it("falls back to neutral classes for unknown deal stages", () => {
    expect(getDealStageToneClass("custom_stage" as never)).toBe("bg-muted text-foreground/80");
    expect(getDealStageTopBorderClass("custom_stage" as never)).toBe("border-t-border");
  });

  it("exposes semantic task status classes", () => {
    expect(taskStatusToneClassMap.open).toBe("bg-status-open/10 text-status-open");
    expect(taskStatusToneClassMap.completed).toBe("bg-status-completed/10 text-status-completed");
    expect(taskStatusTopBorderMap.open).toBe("border-t-status-open");
  });

  it("keeps avatar color assignment deterministic", () => {
    expect(avatarColorFor("John Tan")).toBe(avatarColorFor("John Tan"));
    expect(AVATAR_COLORS).toContain(avatarColorFor("John Tan"));
  });

  it("returns readable avatar foreground text", () => {
    expect(avatarColorFor("John Tan")).toContain("text-foreground");
  });
});
