import { describe, expect, it } from "vitest";
import {
  AVATAR_COLORS,
  DEAL_STAGE_LEFT_BORDER_CLASSES,
  DEAL_STAGE_TOP_BORDER_CLASSES,
  DEAL_STAGE_TONE_CLASSES,
  FILETYPE_COLOR_CLASSES,
  FILETYPE_ICON_CLASSES,
  TASK_STATUS_TONE_CLASSES,
  TASK_STATUS_TOP_BORDER_CLASSES,
} from "./color-maps";

describe("DEAL_STAGE_TONE_CLASSES", () => {
  it("uses semantic stage tokens, not raw Tailwind palette", () => {
    expect(DEAL_STAGE_TONE_CLASSES.leads).toBe("bg-stage-leads/10 text-stage-leads");
    expect(DEAL_STAGE_TONE_CLASSES.negotiation).toBe("bg-stage-negotiation/10 text-stage-negotiation");
    expect(DEAL_STAGE_TONE_CLASSES.offer).toBe("bg-stage-offer/10 text-stage-offer");
    expect(DEAL_STAGE_TONE_CLASSES.closing).toBe("bg-stage-closing/10 text-stage-closing");
    expect(DEAL_STAGE_TONE_CLASSES.lost).toBe("bg-stage-lost/10 text-stage-lost");
  });
  it("contains no raw Tailwind palette classes", () => {
    const values = Object.values(DEAL_STAGE_TONE_CLASSES).join(" ");
    expect(values).not.toMatch(/amber|orange|emerald|sky|rose|green|blue|purple/);
  });
});

describe("DEAL_STAGE_TOP_BORDER_CLASSES", () => {
  it("uses semantic stage tokens", () => {
    expect(DEAL_STAGE_TOP_BORDER_CLASSES.leads).toBe("border-t-stage-leads");
    expect(DEAL_STAGE_TOP_BORDER_CLASSES.lost).toBe("border-t-stage-lost");
  });
});

describe("DEAL_STAGE_LEFT_BORDER_CLASSES", () => {
  it("uses semantic stage tokens", () => {
    expect(DEAL_STAGE_LEFT_BORDER_CLASSES.leads).toBe("border-l-stage-leads");
    expect(DEAL_STAGE_LEFT_BORDER_CLASSES.closing).toBe("border-l-stage-closing");
  });
});

describe("TASK_STATUS_TONE_CLASSES", () => {
  it("uses semantic status tokens", () => {
    expect(TASK_STATUS_TONE_CLASSES.open).toBe("bg-status-open/10 text-status-open");
    expect(TASK_STATUS_TONE_CLASSES.completed).toBe("bg-status-completed/10 text-status-completed");
  });
  it("contains no raw Tailwind palette classes", () => {
    const values = Object.values(TASK_STATUS_TONE_CLASSES).join(" ");
    expect(values).not.toMatch(/amber|orange|emerald|sky|rose|green|blue|cyan/);
  });
});

describe("TASK_STATUS_TOP_BORDER_CLASSES", () => {
  it("uses semantic status tokens", () => {
    expect(TASK_STATUS_TOP_BORDER_CLASSES.open).toBe("border-t-status-open");
    expect(TASK_STATUS_TOP_BORDER_CLASSES.completed).toBe("border-t-status-completed");
  });
});

describe("AVATAR_COLORS", () => {
  it("has 8 entries", () => {
    expect(AVATAR_COLORS).toHaveLength(8);
  });
  it("uses domain tokens, not raw Tailwind palette", () => {
    const joined = AVATAR_COLORS.join(" ");
    expect(joined).not.toMatch(/amber|orange|emerald|sky|rose|slate/);
  });
  it("uses readable foreground text", () => {
    for (const cls of AVATAR_COLORS) {
      expect(cls).toContain("text-foreground");
    }
  });
  it("each entry has a bg and text class", () => {
    for (const cls of AVATAR_COLORS) {
      expect(cls).toMatch(/bg-/);
      expect(cls).toMatch(/text-/);
    }
  });
});

describe("FILETYPE_COLOR_CLASSES", () => {
  it("uses filetype domain tokens", () => {
    expect(FILETYPE_COLOR_CLASSES.xlsx).toBe("text-filetype-spreadsheet");
    expect(FILETYPE_COLOR_CLASSES.xls).toBe("text-filetype-spreadsheet");
    expect(FILETYPE_COLOR_CLASSES.csv).toBe("text-filetype-spreadsheet");
    expect(FILETYPE_COLOR_CLASSES.pdf).toBe("text-filetype-pdf");
    expect(FILETYPE_COLOR_CLASSES.docx).toBe("text-filetype-document");
    expect(FILETYPE_COLOR_CLASSES.doc).toBe("text-filetype-document");
    expect(FILETYPE_COLOR_CLASSES.pptx).toBe("text-filetype-presentation");
    expect(FILETYPE_COLOR_CLASSES.ppt).toBe("text-filetype-presentation");
  });
  it("contains no raw Tailwind palette classes", () => {
    const values = Object.values(FILETYPE_COLOR_CLASSES).join(" ");
    expect(values).not.toMatch(/green|red|blue|orange|emerald|rose/);
  });
});

describe("FILETYPE_ICON_CLASSES", () => {
  it("uses filetype domain tokens", () => {
    expect(FILETYPE_ICON_CLASSES.Spreadsheet).toBe("bg-filetype-spreadsheet/10 text-filetype-spreadsheet");
    expect(FILETYPE_ICON_CLASSES.PDF).toBe("bg-filetype-pdf/10 text-filetype-pdf");
    expect(FILETYPE_ICON_CLASSES.Document).toBe("bg-filetype-document/10 text-filetype-document");
    expect(FILETYPE_ICON_CLASSES.Presentation).toBe("bg-filetype-presentation/10 text-filetype-presentation");
  });
});
