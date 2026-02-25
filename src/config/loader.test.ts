/**
 * @file Config loader tests
 * @description Tests for client config loading. Schema lookup removed - dashboard is source of truth.
 */
import { describe, expect, it, vi } from "vitest";
import { getClientConfig, getAvailableConfigIds } from "./loader";

describe("getClientConfig", () => {
  it("returns default config for 'default' id", () => {
    const config = getClientConfig("default");

    expect(config.id).toBe("default");
    expect(config.name).toBe("Default Configuration");
  });

  it("returns default config for null id", () => {
    const config = getClientConfig(null);

    expect(config.id).toBe("default");
  });

  it("returns default config for unknown id with console warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = getClientConfig("unknown-client");

    expect(config.id).toBe("default");
    expect(warnSpy).toHaveBeenCalledWith(
      'Unknown client_config_id: "unknown-client", using default'
    );

    warnSpy.mockRestore();
  });
});

describe("getAvailableConfigIds", () => {
  it("returns array of available config IDs", () => {
    const ids = getAvailableConfigIds();

    expect(ids).toContain("default");
    expect(Array.isArray(ids)).toBe(true);
  });
});

describe("loader (simplified - no schema exports)", () => {
  it("does not export getSchemaForTag", async () => {
    const loader = await import("./loader.js");
    expect(loader).not.toHaveProperty("getSchemaForTag");
  });

  it("does not export SchemaInfo", async () => {
    const loader = await import("./loader.js");
    expect(loader).not.toHaveProperty("SchemaInfo");
  });

  it("does not export schemaRegistry", async () => {
    const loader = await import("./loader.js");
    expect(loader).not.toHaveProperty("schemaRegistry");
  });
});
