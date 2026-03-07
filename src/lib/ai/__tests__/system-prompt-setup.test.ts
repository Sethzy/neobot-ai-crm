/**
 * Tests for the setup-mode system prompt variant.
 * @module lib/ai/__tests__/system-prompt-setup
 */
import { describe, expect, it } from "vitest";

import { CRM_SETUP_SYSTEM_PROMPT } from "../system-prompt";

describe("CRM_SETUP_SYSTEM_PROMPT", () => {
  it("describes CRM setup and configure_crm usage", () => {
    expect(CRM_SETUP_SYSTEM_PROMPT).toContain("configure_crm");
    expect(CRM_SETUP_SYSTEM_PROMPT.toLowerCase()).toContain("crm setup");
    expect(CRM_SETUP_SYSTEM_PROMPT.toLowerCase()).toContain("before/after");
  });
});
