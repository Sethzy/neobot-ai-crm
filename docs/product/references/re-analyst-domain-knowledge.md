# RE Analyst Domain Knowledge

Source material for the `re-analyst` inner skill. These are seeded to client storage as
reference files under `{clientId}/skills/re-analyst/references/`.

The canonical content lives in `src/lib/runner/skills/skill-templates.ts` as
`SG_PROPERTY_TAXES_CONTENT` and `YIELD_BENCHMARKS_CONTENT`. This file is the
human-readable reference for the same data.

---

## sg-property-taxes.md

Covers:
- Buyer's Stamp Duty (BSD) — progressive rates up to 6%
- Additional Buyer's Stamp Duty (ABSD) — citizen/PR/foreigner/entity rates (Apr 2023)
- Total Debt Servicing Ratio (TDSR) — 55% cap, 4% stress-test
- Property Tax (Annual) — owner-occupied and non-owner-occupied brackets
- Lease Decay — 99-year leasehold depreciation rules and financing restrictions

## yield-benchmarks.md

Covers:
- REIT benchmarks by category (retail, office, industrial, hospitality, healthcare)
- Residential rental yields by district (CCR, RCR, OCR)
- Risk-free rate references (SGS 10-year, CPF OA, fixed deposit)
- Common investment thresholds (net yield, cash-on-cash, TDSR comfort zones)

> Rates current as of 2025. The agent skill warns users to verify before client-facing use.
