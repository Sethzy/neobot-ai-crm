/**
 * Tests for shared CRM display color helpers.
 * @module lib/crm/display.test
 */
import { describe, expect, it } from "vitest";

import { AVATAR_COLORS } from "@/lib/ui/color-maps";

import {
  avatarColorFor,
  formatCustomFieldValue,
  getDealStageToneClass,
  getDealStageTopBorderClass,
  parseCustomFieldInputValue,
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
    expect(taskStatusToneClassMap.todo).toBe("bg-status-todo/10 text-status-todo");
    expect(taskStatusToneClassMap.in_progress).toBe("bg-status-in-progress/10 text-status-in-progress");
    expect(taskStatusToneClassMap.done).toBe("bg-status-done/10 text-status-done");
    expect(taskStatusTopBorderMap.todo).toBe("border-t-status-todo");
  });

  it("keeps avatar color assignment deterministic", () => {
    expect(avatarColorFor("John Tan")).toBe(avatarColorFor("John Tan"));
    expect(AVATAR_COLORS).toContain(avatarColorFor("John Tan"));
  });

  it("returns readable avatar foreground text", () => {
    expect(avatarColorFor("John Tan")).toContain("text-foreground");
  });

  it("formats boolean custom fields for inline editors", () => {
    expect(formatCustomFieldValue("boolean", true)).toBe("true");
    expect(formatCustomFieldValue("boolean", false)).toBe("false");
    expect(formatCustomFieldValue("boolean", null)).toBeNull();
  });

  it("parses boolean custom field editor values", () => {
    expect(parseCustomFieldInputValue("boolean", "true")).toBe(true);
    expect(parseCustomFieldInputValue("boolean", "yes")).toBe(true);
    expect(parseCustomFieldInputValue("boolean", "1")).toBe(true);
    expect(parseCustomFieldInputValue("boolean", "false")).toBe(false);
    expect(parseCustomFieldInputValue("boolean", "no")).toBe(false);
    expect(parseCustomFieldInputValue("boolean", "0")).toBe(false);
    expect(parseCustomFieldInputValue("boolean", "")).toBeNull();
    expect(() => parseCustomFieldInputValue("boolean", "maybe")).toThrow(/true or false/i);
  });
});
