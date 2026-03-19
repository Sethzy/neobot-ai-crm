/**
 * Regression tests for CRM dictionary token usage.
 * @module components/crm/dictionary-value.test
 */
import { describe, expect, it } from "vitest";

import {
  contactTypeDictionaryMap,
  crmLifecycleStageDictionaryMap,
  crmSourceDictionaryMap,
  crmStatusDictionaryMap,
  dealStageDictionaryMap,
} from "./dictionary-value";

function collectColors(...maps: Array<Record<string, { color?: string | null }>>) {
  return maps.flatMap((map) =>
    Object.values(map)
      .map((entry) => entry.color)
      .filter((color): color is string => Boolean(color))
  );
}

describe("CRM dictionary token colors", () => {
  it("uses semantic or domain CSS variables instead of raw hex colors", () => {
    const colors = collectColors(
      contactTypeDictionaryMap,
      dealStageDictionaryMap,
      crmStatusDictionaryMap,
      crmLifecycleStageDictionaryMap,
      crmSourceDictionaryMap
    );

    expect(colors.length).toBeGreaterThan(0);

    for (const color of colors) {
      expect(color).toMatch(/^var\(--/);
      expect(color).not.toMatch(/^#/);
    }
  });

  it("maps deal stages to stage domain tokens", () => {
    expect(dealStageDictionaryMap.leads.color).toBe("var(--stage-leads)");
    expect(dealStageDictionaryMap.negotiation.color).toBe("var(--stage-negotiation)");
    expect(dealStageDictionaryMap.offer.color).toBe("var(--stage-offer)");
    expect(dealStageDictionaryMap.closing.color).toBe("var(--stage-closing)");
    expect(dealStageDictionaryMap.lost.color).toBe("var(--stage-lost)");
  });
});
