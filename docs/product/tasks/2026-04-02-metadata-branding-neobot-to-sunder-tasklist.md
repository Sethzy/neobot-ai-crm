# Metadata Branding: NeoBot → Sunder Implementation Plan

**PR:** Out-of-plan — production hardening (SEO / branding consistency)
**Decisions:** N/A (branding, not architecture)
**Goal:** Fix metadata mismatch where `app/page.tsx` ships NeoBot branding while the rest of the app uses Sunder, and add `metadataBase` to root layout for correct OG URL resolution.

**Architecture:** Next.js Metadata API merges metadata from `layout.tsx` (base) with `page.tsx` (page-specific). Currently `app/layout.tsx` says "Sunder" but has no `metadataBase`, while `app/page.tsx` hardcodes NeoBot titles, NeoBot OG images pointing to `https://www.neobot.com/`, and a NeoBot canonical URL. Search engines see contradictory signals between the root metadata and the landing page metadata. The fix is: (1) add `metadataBase` to root layout so all relative OG/image URLs resolve correctly, (2) update landing page metadata to Sunder branding, (3) fix the logo URL in the JSON-LD schema that still references `neobot-logo.svg`.

**Tech Stack:** Next.js 15 Metadata API, `src/lib/site-url.ts`, Vitest

---

## Relevant Files

- Modify: `app/layout.tsx:38-45,56`
- Modify: `app/page.tsx:17-38`
- Create: `app/page.test.tsx`
- Create: `app/layout.test.tsx`

---

## Task 1: Write tests for landing page metadata

**Files:**
- Create: `app/page.test.tsx`

**Step 1: Write the failing tests**

We're testing that the exported `metadata` object has the correct Sunder branding — no NeoBot references, correct URLs. These are pure data tests (no rendering needed).

```typescript
/**
 * Tests for landing page metadata — ensures Sunder branding, no NeoBot references.
 * @module app/page.test
 */
import { describe, it, expect } from "vitest";

describe("landing page metadata", () => {
  async function getMetadata() {
    const mod = await import("./page");
    return mod.metadata;
  }

  it("uses Sunder in the title, not NeoBot", async () => {
    const metadata = await getMetadata();
    expect(metadata.title).toMatch(/sunder/i);
    expect(metadata.title).not.toMatch(/neobot/i);
  });

  it("uses Sunder in the description, not NeoBot", async () => {
    const metadata = await getMetadata();
    expect(metadata.description).toMatch(/sunder/i);
    expect(metadata.description).not.toMatch(/neobot/i);
  });

  it("has openGraph title with Sunder branding", async () => {
    const metadata = await getMetadata();
    const og = metadata.openGraph as Record<string, unknown>;
    expect(og.title).toMatch(/sunder/i);
    expect(og.title).not.toMatch(/neobot/i);
  });

  it("has openGraph URL pointing to trysunder.com", async () => {
    const metadata = await getMetadata();
    const og = metadata.openGraph as Record<string, unknown>;
    expect(og.url).toContain("trysunder.com");
    expect(og.url).not.toContain("neobot.com");
  });

  it("has openGraph images pointing to trysunder.com", async () => {
    const metadata = await getMetadata();
    const og = metadata.openGraph as Record<string, unknown>;
    const images = og.images as string[];
    images.forEach((img) => {
      expect(img).toContain("trysunder.com");
      expect(img).not.toContain("neobot.com");
    });
  });

  it("has twitter title with Sunder branding", async () => {
    const metadata = await getMetadata();
    const twitter = metadata.twitter as Record<string, unknown>;
    expect(twitter.title).toMatch(/sunder/i);
    expect(twitter.title).not.toMatch(/neobot/i);
  });

  it("has twitter images pointing to trysunder.com", async () => {
    const metadata = await getMetadata();
    const twitter = metadata.twitter as Record<string, unknown>;
    const images = twitter.images as string[];
    images.forEach((img) => {
      expect(img).toContain("trysunder.com");
      expect(img).not.toContain("neobot.com");
    });
  });

  it("has canonical URL pointing to trysunder.com", async () => {
    const metadata = await getMetadata();
    const alternates = metadata.alternates as Record<string, unknown>;
    expect(alternates.canonical).toContain("trysunder.com");
    expect(alternates.canonical).not.toContain("neobot.com");
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
pnpm vitest run app/page.test.tsx
```

Expected: FAIL — metadata currently contains "NeoBot" titles and `neobot.com` URLs.

---

## Task 2: Write tests for root layout metadata

**Files:**
- Create: `app/layout.test.tsx`

**Step 3: Write the failing tests**

Test that the root layout exports `metadataBase` and that the JSON-LD schema uses Sunder branding.

```typescript
/**
 * Tests for root layout metadata — metadataBase and JSON-LD schema branding.
 * @module app/layout.test
 */
import { describe, it, expect } from "vitest";

describe("root layout metadata", () => {
  async function getMetadata() {
    const mod = await import("./layout");
    return mod.metadata;
  }

  it("exports metadataBase pointing to trysunder.com", async () => {
    const metadata = await getMetadata();
    expect(metadata.metadataBase).toBeInstanceOf(URL);
    expect((metadata.metadataBase as URL).href).toContain("trysunder.com");
  });

  it("does not reference neobot in title or description", async () => {
    const metadata = await getMetadata();
    expect(metadata.title).not.toMatch(/neobot/i);
    expect(metadata.description).not.toMatch(/neobot/i);
  });
});
```

**Step 4: Run tests to verify they fail**

Run:
```bash
pnpm vitest run app/layout.test.tsx
```

Expected: FAIL — `metadataBase` is not set (will be `undefined`).

---

## Task 3: Fix landing page metadata (`app/page.tsx`)

**Files:**
- Modify: `app/page.tsx:17-38`

**Step 5: Update metadata to Sunder branding**

Replace the entire `metadata` export in `app/page.tsx` (lines 17-39):

Replace:
```typescript
export const metadata: Metadata = {
  title: "NeoBot - Your AI Sales Assistant. Get Things Done via Chat.",
  description:
    "NeoBot runs your pipeline while you sleep — follow-ups, CRM updates, scheduling, and admin handled automatically. Built for B2C salespeople.",
  openGraph: {
    title: "NeoBot - Your AI Sales Assistant. Get Things Done via Chat.",
    description:
      "NeoBot runs your pipeline while you sleep — follow-ups, CRM updates, scheduling, and admin handled automatically. Built for B2C salespeople.",
    images: ["https://www.neobot.com/exports/og-image.png"],
    url: "https://www.neobot.com/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NeoBot - Your AI Sales Assistant. Get Things Done via Chat.",
    description:
      "NeoBot runs your pipeline while you sleep — follow-ups, CRM updates, scheduling, and admin handled automatically. Built for B2C salespeople.",
    images: ["https://www.neobot.com/exports/og-image.png"],
  },
  alternates: {
    canonical: "https://www.neobot.com/",
  },
};
```

With:
```typescript
export const metadata: Metadata = {
  title: "Sunder — AI That Runs Your Pipeline While You Sleep",
  description:
    "Sunder handles follow-ups, CRM updates, scheduling, and admin automatically via chat. Built for solo practitioners in advisory sales.",
  openGraph: {
    title: "Sunder — AI That Runs Your Pipeline While You Sleep",
    description:
      "Sunder handles follow-ups, CRM updates, scheduling, and admin automatically via chat. Built for solo practitioners in advisory sales.",
    images: ["https://www.trysunder.com/exports/og-image.png"],
    url: "https://www.trysunder.com/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sunder — AI That Runs Your Pipeline While You Sleep",
    description:
      "Sunder handles follow-ups, CRM updates, scheduling, and admin automatically via chat. Built for solo practitioners in advisory sales.",
    images: ["https://www.trysunder.com/exports/og-image.png"],
  },
  alternates: {
    canonical: "https://www.trysunder.com/",
  },
};
```

**Step 6: Run landing page tests to verify they pass**

Run:
```bash
pnpm vitest run app/page.test.tsx
```

Expected: ALL PASS

---

## Task 4: Fix root layout metadata (`app/layout.tsx`)

**Files:**
- Modify: `app/layout.tsx:38-45,56`

**Step 7: Add `metadataBase` and fix logo URL**

In `app/layout.tsx`, update the `metadata` export (lines 38-45) to include `metadataBase`:

Replace:
```typescript
export const metadata: Metadata = {
  title: "Sunder - AI Document Processing for Singapore SMEs",
  description:
    "AI-powered document processing platform for invoices, receipts, and contracts.",
  icons: {
    icon: "/favicon.svg",
  },
};
```

With:
```typescript
export const metadata: Metadata = {
  metadataBase: new URL("https://www.trysunder.com"),
  title: "Sunder - AI Document Processing for Singapore SMEs",
  description:
    "AI-powered document processing platform for invoices, receipts, and contracts.",
  icons: {
    icon: "/favicon.svg",
  },
};
```

Also fix the JSON-LD schema logo URL (line 56):

Replace:
```typescript
    logo: "https://www.trysunder.com/neobot-logo.svg",
```

With:
```typescript
    logo: "https://www.trysunder.com/sunder-logo.svg",
```

**Step 8: Run layout tests to verify they pass**

Run:
```bash
pnpm vitest run app/layout.test.tsx
```

Expected: ALL PASS

**Step 9: Run all tests to verify no regressions**

Run:
```bash
pnpm vitest run app/page.test.tsx app/layout.test.tsx
```

Expected: ALL PASS, no warnings.

**Step 10: Commit**

```bash
git add app/page.tsx app/page.test.tsx app/layout.tsx app/layout.test.tsx
git commit -m "fix(seo): replace NeoBot metadata with Sunder branding + add metadataBase

Landing page metadata still referenced NeoBot titles, neobot.com OG images,
and neobot.com canonical URL. Root layout was missing metadataBase, so
relative OG image URLs could not resolve correctly.

Changes:
- app/page.tsx: all metadata now uses Sunder branding + trysunder.com URLs
- app/layout.tsx: add metadataBase, fix JSON-LD logo URL
- Add tests for both files verifying no NeoBot references remain"
```

---

## Notes

**Out of scope for this tasklist:**
- Landing page *components* (Header, Footer, Logo, FAQs, Pricing, etc.) still reference "NeoBot" and "neobot" extensively. That is a broader branding sweep — this tasklist only fixes the SEO-critical metadata layer.
- The `app/layout.tsx:56` logo URL (`sunder-logo.svg`) assumes the file exists in `/public/`. Verify it does, or use the existing favicon path.
- The root layout description ("AI Document Processing for Singapore SMEs") may also need updating to match the product's current positioning as an AI orchestration SaaS. That's a copy decision, not a code fix.

---

## Verification Checklist

- [ ] Every new test has been watched to fail before implementation
- [ ] Each test failed for expected reason (NeoBot in metadata, missing metadataBase)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Output pristine (no errors, warnings)
- [ ] Tests verify real exported metadata objects (no mocks)
- [ ] No NeoBot references remain in `app/page.tsx` metadata
- [ ] `metadataBase` is set in root layout
- [ ] JSON-LD logo URL no longer references neobot
