# Sandbox Artifact Publishing Implementation Plan

**PR:** PR 53: Sandbox Artifact Publishing
**Decisions:** EXEC-04, EXEC-07, EXEC-08
**Goal:** Agent generates finished web deliverables (property showcases, pitch pages, neighborhood guides) inside a per-thread Sprite with Claude Code CLI, returns a live preview URL, supports multi-turn iteration, and publishes static HTML on "ship it."

**Architecture:** Runner (Gemini Flash) chains CRM/search/browser tools first to gather property data + photos. Then it calls `publish_artifact`. The tool keeps the PR 52 split explicit: `findActiveSpriteSession()` / `upsertSpriteSession()` / `touchSpriteSession()` come from `sprite-session.ts`, while Sprite lifecycle stays in `sprites-client.ts` via `getOrCreateSprite({ token, existingSpriteName, spriteName })`. Each thread gets one generic Sprite (`thread-{threadId-prefix}`), reused across artifact iterations. On first run the tool writes the committed React scaffold into the Sprite and runs `npm install` inside the Sprite explicitly. The runner downloads photos on the server with `fetch()`, then writes them into the Sprite via `sprite.filesystem().writeFile()` so Sprite egress stays tightly allowlisted. The runner owns the dev server lifecycle: it creates a Service via `sprite.createService()` (Services survive hibernation, unlike sessions), checks for existing services on follow-up, and restarts if needed. The preview URL is always read from `sprite.url`, never synthesized. On follow-up messages, the same Sprite wakes (<1s), all files intact, Claude Code iterates. When the user says "ship it," the tool builds static HTML, uploads it via the shared `createAgentFileClient()` abstraction, and returns a 30-day signed URL.

**Tech Stack:** `@fly/sprites@0.0.1-rc37` SDK (from PR 52), Vite 6 + React 18 + Tailwind 4 (via `@tailwindcss/vite` plugin, not PostCSS), Claude Code CLI (pre-installed on Sprites), Supabase Storage, Vitest

**Prerequisites:**
- Node 24+ required (Sprites SDK `engines.node >= 24.0.0`)
- PR 52 merged (shared Sprites infra -- see "Reuse from PR 52" below)

**Design doc:** `docs/product/designs/sandbox-skill-execution.md` (sections 7, 8)
**SDK reference:** `docs/product/references/sprites-sdk-verification.md`
**Product spec:** `roadmap docs/Sunder - Source of Truth/services/01-Built-In Services (Imported from RE-AI-CRM).md` section 13 (Artifact Publishing)

**SDK corrections applied (from `sprites-sdk-verification.md`):**
- `execFile()` with arg arrays, not `exec()` with string commands (exec splits on whitespace, breaks quoting)
- `sprite.createService()` for dev server (Services survive hibernation, sessions do not)
- `sprite.updateURLSettings({ auth: 'public' })` required (preview URLs private by default)
- Pin `@fly/sprites@0.0.1-rc37` (stable `0.0.1` lacks filesystem, services, policy APIs)
- Node 24+ required (`engines.node >= 24.0.0` in both stable and rc37)
- `ANTHROPIC_API_KEY` passed per-command via `env` option on `execFile()`, not written to Sprite config
- Preview URL read from `sprite.url`, never hardcoded (domain drift between `*.sprites.app` and `*.sprites.dev`)
- No custom Sprite templates -- default Sprite has Claude Code, Node, Python pre-installed

**Reviewer corrections applied:**
1. Scaffold uses Vite 6 + `@tailwindcss/vite` (not PostCSS). Must actually build with `npm run build`.
2. No pre-provisioning script. Template files are written explicitly on first run, then `npm install` runs inside the Sprite and persists across hibernation.
3. One Sprite per thread. PR 53 keeps PR 52's explicit split: DB session helpers live in `sprite-session.ts`; Sprite lifecycle stays in `sprites-client.ts`.
4. PR 52 dependency kept explicit. PR 53 depends on PR 52's infra.
5. Code samples use correct AI SDK v6 `tool({ inputSchema, execute })` pattern and correct `@fly/sprites@0.0.1-rc37` API.
6. Runner owns service lifecycle (create, check, recover). The Claude prompt does NOT include "run npm run dev."
7. Real behavior-first TDD happens during implementation. These docs still use module-not-found red phases in places, but the final code should have behavior coverage around first run, follow-up, ship-it, and failure paths.
8. DRY: reuse `createAgentFileClient()` for artifact upload, `loadSkillFilesForSandbox()` for user skills, and the explicit `sprites-client.ts` / `sprite-session.ts` split from PR 52.

**Publishing model:** Published artifacts use Supabase Storage signed URLs with a 30-day expiry. This is time-limited, not permanent. Permanent hosting (here.now or similar) is a future enhancement -- be honest about expiry in the agent's response.

**Scaffold theme:** Visually neutral/clean. No hardcoded dark/gold theme. The user's `frontend-design/SKILL.md` controls the aesthetic.

**Skill creation:** Don't auto-create `frontend-design/SKILL.md` from casual chat. Skill creation is explicit (user says "set up my brand preferences" or uses the Skills page).

---

## Relevant Files

### Create
- `src/lib/sandbox/templates/property-showcase/` -- Pre-scaffolded React property page template (source files, committed to repo)
- `src/lib/sandbox/artifact-prompt.ts` -- Prompt building for first-run / follow-up / ship-it modes
- `src/lib/sandbox/__tests__/artifact-prompt.test.ts`
- `src/lib/sandbox/artifact-runner.ts` -- Orchestrates property data write, runner-side photo download, skill loading, Claude CLI invocation, template first-run setup, service lifecycle
- `src/lib/sandbox/__tests__/artifact-runner.test.ts`
- `src/lib/runner/tools/sandbox/publish-artifact.ts` -- `createPublishArtifactTool()` factory (AI SDK v6 `tool({ inputSchema, execute })`)
- `src/lib/runner/tools/sandbox/__tests__/publish-artifact.test.ts`

### Modify
- `src/lib/runner/tool-registry.ts` -- add `publish_artifact` to `createRunnerTools()`
- `src/lib/runner/__tests__/tool-registry.test.ts` -- add test for `publish_artifact` registration
- `src/lib/ai/system-prompt.ts` -- add `publish_artifact` tool guidance

### Reuse from PR 52 (don't modify)
- `src/lib/sandbox/sprites-client.ts` -- `getSpritesClient()` + `getOrCreateSprite()` lifecycle wrapper
- `src/lib/sandbox/sprite-session.ts` -- `findActiveSpriteSession()` / `upsertSpriteSession()` / `touchSpriteSession()` DB tracking helpers
- `src/lib/sandbox/skill-loader.ts` -- `loadSkillFilesForSandbox(supabase, clientId, slug)` loads skill files from Supabase Storage
- `src/lib/sandbox/env.ts` -- `isSandboxConfigured()` / `getSpritesToken()` env helpers
- `src/lib/sandbox/types.ts` -- `SpriteSession`, `SpriteResult`, `SpriteSkillFile` types
- `.env.local` -- `SPRITES_TOKEN`, `ANTHROPIC_API_KEY`

### Reuse from existing codebase (don't modify)
- `src/lib/storage/agent-files.ts` -- `createAgentFileClient()` for uploading output HTML to Supabase Storage signed URLs
- `src/lib/storage/agent-paths.ts` -- path conventions
- `src/lib/runner/skills/discover-skills.ts` -- `discoverUserSkills()`, `getSkillContent()` for checking if a skill exists

### Reference (read, don't modify)
- `docs/product/designs/sandbox-skill-execution.md` -- full design doc
- `docs/product/references/sprites-sdk-verification.md` -- SDK verification findings
- `src/lib/runner/tools/utility/generate-pdf.ts` -- example of AI SDK v6 `tool({ inputSchema, execute })` pattern
- `app/api/files/upload/route.ts` -- current upload route (for understanding, PR 53 doesn't modify this)
- `src/components/chat/chat-composer.tsx` -- current composer (same)

---

## Task 1: Build the pre-scaffolded React property page template

The template is committed to the repo and written into the Sprite filesystem on first use by `artifact-runner.ts`. Claude Code tweaks it instead of building from scratch. This task has no unit tests -- it is a static asset (React project scaffold).

The scaffold is structurally strong (7 components) but visually neutral -- clean/minimal default, not an opinionated dark/gold theme. The user's `frontend-design/SKILL.md` controls the aesthetic.

**Tailwind 4 setup:** Uses `@tailwindcss/vite` plugin (not PostCSS). No `tailwind.config.ts` or `postcss.config.js` needed with Tailwind 4 + Vite.

**Files:**
- Create: `src/lib/sandbox/templates/property-showcase/` (entire directory)

**Step 1: Create the project scaffold**

Create the following directory structure:

```
src/lib/sandbox/templates/property-showcase/
├── package.json
├── vite.config.ts
├── index.html
├── build.sh
├── .gitignore
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Hero.tsx
│   │   ├── PhotoGallery.tsx
│   │   ├── PropertyDetails.tsx
│   │   ├── NeighborhoodMap.tsx
│   │   ├── Comparables.tsx
│   │   ├── AgentContact.tsx
│   │   └── MortgageCalc.tsx
│   ├── data/
│   │   └── property.json
│   └── styles/
│       └── globals.css
```

`src/lib/sandbox/templates/property-showcase/package.json`:

```json
{
  "name": "property-showcase",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 8080",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "lucide-react": "^0.468.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.2",
    "vite": "^6.0.0",
    "vite-plugin-singlefile": "^2.0.3"
  }
}
```

`src/lib/sandbox/templates/property-showcase/vite.config.ts`:

```typescript
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: {
    port: 8080,
    host: "0.0.0.0",
  },
});
```

`src/lib/sandbox/templates/property-showcase/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Property Showcase</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/lib/sandbox/templates/property-showcase/build.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
npm run build
cp dist/index.html /tmp/output.html
echo "Built single-file HTML at /tmp/output.html"
```

`src/lib/sandbox/templates/property-showcase/.gitignore`:

```
node_modules
dist
```

`src/lib/sandbox/templates/property-showcase/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/lib/sandbox/templates/property-showcase/src/App.tsx`:

```tsx
import propertyData from "./data/property.json";
import { AgentContact } from "./components/AgentContact";
import { Comparables } from "./components/Comparables";
import { Hero } from "./components/Hero";
import { MortgageCalc } from "./components/MortgageCalc";
import { NeighborhoodMap } from "./components/NeighborhoodMap";
import { PhotoGallery } from "./components/PhotoGallery";
import { PropertyDetails } from "./components/PropertyDetails";

export default function App() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Hero property={propertyData} />
      <PhotoGallery photos={propertyData.photos} />
      <PropertyDetails property={propertyData} />
      <NeighborhoodMap neighborhood={propertyData.neighborhood} />
      <Comparables comparables={propertyData.comparables} />
      <MortgageCalc price={propertyData.price} />
      <AgentContact agent={propertyData.agent} />
    </div>
  );
}
```

`src/lib/sandbox/templates/property-showcase/src/data/property.json`:

```json
{
  "address": "42 Noriega Street",
  "price": 1800000,
  "bedrooms": 3,
  "bathrooms": 2,
  "sqft": 1200,
  "tenure": "Freehold",
  "floor": "12",
  "description": "Luxurious 3-bedroom apartment with stunning city views.",
  "heroPhoto": "https://placehold.co/1200x600/f5f5f5/333333?text=Hero+Photo",
  "photos": [
    "https://placehold.co/600x400/f5f5f5/333333?text=Photo+1",
    "https://placehold.co/600x400/f5f5f5/333333?text=Photo+2",
    "https://placehold.co/600x400/f5f5f5/333333?text=Photo+3",
    "https://placehold.co/600x400/f5f5f5/333333?text=Photo+4",
    "https://placehold.co/600x400/f5f5f5/333333?text=Photo+5",
    "https://placehold.co/600x400/f5f5f5/333333?text=Photo+6"
  ],
  "neighborhood": {
    "name": "Bukit Timah",
    "nearestMrt": "Botanic Gardens MRT",
    "mrtDistance": "3 min walk",
    "amenities": ["Cold Storage", "Serene Centre", "Botanic Gardens"],
    "schools": ["Nanyang Primary", "Raffles Girls School"],
    "mapEmbedUrl": "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3988.7!2d103.8!3d1.3!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1"
  },
  "comparables": [
    { "address": "40 Noriega Street", "price": 1750000, "sqft": 1150, "date": "2026-01" },
    { "address": "44 Noriega Street", "price": 1900000, "sqft": 1250, "date": "2026-02" },
    { "address": "38 Noriega Street", "price": 1650000, "sqft": 1100, "date": "2025-12" }
  ],
  "agent": {
    "name": "Jane Smith",
    "phone": "+65 9123 4567",
    "email": "jane@example.com",
    "photo": "https://placehold.co/200x200/f5f5f5/333333?text=Agent",
    "agency": "PropConnect Realty"
  }
}
```

`src/lib/sandbox/templates/property-showcase/src/styles/globals.css`:

```css
@import "tailwindcss";

body {
  font-family: system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

`src/lib/sandbox/templates/property-showcase/src/components/Hero.tsx`:

```tsx
interface HeroProps {
  property: {
    address: string;
    price: number;
    heroPhoto: string;
  };
}

export function Hero({ property }: HeroProps) {
  const formatted = new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(property.price);

  return (
    <section className="relative h-[70vh] min-h-[500px] overflow-hidden">
      <img
        src={property.heroPhoto}
        alt={property.address}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-8 md:p-16">
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-2">
          {property.address}
        </h1>
        <p className="text-2xl md:text-3xl text-white/90 font-semibold">
          {formatted}
        </p>
      </div>
    </section>
  );
}
```

`src/lib/sandbox/templates/property-showcase/src/components/PhotoGallery.tsx`:

```tsx
interface PhotoGalleryProps {
  photos: string[];
}

export function PhotoGallery({ photos }: PhotoGalleryProps) {
  return (
    <section className="px-8 py-16 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold mb-8">Gallery</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {photos.map((url, i) => (
          <img
            key={i}
            src={url}
            alt={`Property photo ${i + 1}`}
            className="w-full aspect-[3/2] object-cover rounded-lg hover:scale-105 transition-transform duration-300"
          />
        ))}
      </div>
    </section>
  );
}
```

`src/lib/sandbox/templates/property-showcase/src/components/PropertyDetails.tsx`:

```tsx
interface PropertyDetailsProps {
  property: {
    bedrooms: number;
    bathrooms: number;
    sqft: number;
    tenure: string;
    floor: string;
    description: string;
  };
}

export function PropertyDetails({ property }: PropertyDetailsProps) {
  const specs = [
    { label: "Bedrooms", value: property.bedrooms },
    { label: "Bathrooms", value: property.bathrooms },
    { label: "Area", value: `${property.sqft} sqft` },
    { label: "Tenure", value: property.tenure },
    { label: "Floor", value: property.floor },
  ];

  return (
    <section className="px-8 py-16 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold mb-8">Property Details</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-8">
        {specs.map((spec) => (
          <div key={spec.label} className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500 uppercase tracking-wider">{spec.label}</p>
            <p className="text-xl font-semibold mt-1">{spec.value}</p>
          </div>
        ))}
      </div>
      <p className="text-lg text-gray-600 leading-relaxed">{property.description}</p>
    </section>
  );
}
```

`src/lib/sandbox/templates/property-showcase/src/components/NeighborhoodMap.tsx`:

```tsx
interface NeighborhoodMapProps {
  neighborhood: {
    name: string;
    nearestMrt: string;
    mrtDistance: string;
    amenities: string[];
    schools: string[];
    mapEmbedUrl: string;
  };
}

export function NeighborhoodMap({ neighborhood }: NeighborhoodMapProps) {
  return (
    <section className="px-8 py-16 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold mb-8">Neighborhood</h2>
      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <h3 className="text-xl font-semibold mb-4">{neighborhood.name}</h3>
          <p className="text-gray-600 mb-4">
            {neighborhood.nearestMrt} -- {neighborhood.mrtDistance}
          </p>
          <div className="mb-4">
            <h4 className="text-sm text-gray-500 uppercase tracking-wider mb-2">Amenities</h4>
            <ul className="space-y-1">
              {neighborhood.amenities.map((a) => (
                <li key={a} className="text-gray-600">{a}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm text-gray-500 uppercase tracking-wider mb-2">Schools</h4>
            <ul className="space-y-1">
              {neighborhood.schools.map((s) => (
                <li key={s} className="text-gray-600">{s}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="aspect-video rounded-lg overflow-hidden">
          <iframe
            src={neighborhood.mapEmbedUrl}
            className="w-full h-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Neighborhood Map"
          />
        </div>
      </div>
    </section>
  );
}
```

`src/lib/sandbox/templates/property-showcase/src/components/Comparables.tsx`:

```tsx
interface Comparable {
  address: string;
  price: number;
  sqft: number;
  date: string;
}

interface ComparablesProps {
  comparables: Comparable[];
}

export function Comparables({ comparables }: ComparablesProps) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: "SGD",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <section className="px-8 py-16 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold mb-8">Recent Transactions</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-3 text-sm text-gray-500 uppercase tracking-wider">Address</th>
              <th className="py-3 text-sm text-gray-500 uppercase tracking-wider">Price</th>
              <th className="py-3 text-sm text-gray-500 uppercase tracking-wider">PSF</th>
              <th className="py-3 text-sm text-gray-500 uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody>
            {comparables.map((c) => (
              <tr key={c.address} className="border-b border-gray-100">
                <td className="py-3">{c.address}</td>
                <td className="py-3">{fmt(c.price)}</td>
                <td className="py-3">{fmt(Math.round(c.price / c.sqft))}</td>
                <td className="py-3 text-gray-500">{c.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

`src/lib/sandbox/templates/property-showcase/src/components/AgentContact.tsx`:

```tsx
interface AgentContactProps {
  agent: {
    name: string;
    phone: string;
    email: string;
    photo: string;
    agency: string;
  };
}

export function AgentContact({ agent }: AgentContactProps) {
  return (
    <section className="px-8 py-16 max-w-7xl mx-auto">
      <div className="bg-gray-50 rounded-2xl p-8 flex flex-col md:flex-row items-center gap-8">
        <img
          src={agent.photo}
          alt={agent.name}
          className="w-32 h-32 rounded-full object-cover"
        />
        <div className="text-center md:text-left">
          <h3 className="text-2xl font-bold">{agent.name}</h3>
          <p className="text-gray-500 mb-4">{agent.agency}</p>
          <div className="flex flex-col md:flex-row gap-4">
            <a
              href={`tel:${agent.phone}`}
              className="px-6 py-3 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors text-center"
            >
              {agent.phone}
            </a>
            <a
              href={`mailto:${agent.email}`}
              className="px-6 py-3 border border-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition-colors text-center"
            >
              {agent.email}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
```

`src/lib/sandbox/templates/property-showcase/src/components/MortgageCalc.tsx`:

```tsx
import { useState } from "react";

interface MortgageCalcProps {
  price: number;
}

export function MortgageCalc({ price }: MortgageCalcProps) {
  const [downPaymentPct, setDownPaymentPct] = useState(25);
  const [rate, setRate] = useState(3.8);
  const [years, setYears] = useState(25);

  const principal = price * (1 - downPaymentPct / 100);
  const monthlyRate = rate / 100 / 12;
  const numPayments = years * 12;
  const monthly =
    monthlyRate > 0
      ? (principal * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
        (Math.pow(1 + monthlyRate, numPayments) - 1)
      : principal / numPayments;

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: "SGD",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <section className="px-8 py-16 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold mb-8">Mortgage Calculator</h2>
      <div className="bg-gray-50 rounded-2xl p-8 grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <label className="text-sm text-gray-500 uppercase tracking-wider">
              Down Payment: {downPaymentPct}%
            </label>
            <input
              type="range"
              min={5}
              max={50}
              value={downPaymentPct}
              onChange={(e) => setDownPaymentPct(Number(e.target.value))}
              className="w-full mt-2"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 uppercase tracking-wider">
              Interest Rate: {rate}%
            </label>
            <input
              type="range"
              min={1}
              max={8}
              step={0.1}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="w-full mt-2"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 uppercase tracking-wider">
              Loan Tenure: {years} years
            </label>
            <input
              type="range"
              min={5}
              max={35}
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              className="w-full mt-2"
            />
          </div>
        </div>
        <div className="flex flex-col items-center justify-center">
          <p className="text-sm text-gray-500 uppercase tracking-wider mb-2">
            Monthly Payment
          </p>
          <p className="text-4xl font-bold">{fmt(monthly)}</p>
          <p className="text-gray-400 mt-2">
            Loan: {fmt(principal)} | Down: {fmt(price - principal)}
          </p>
        </div>
      </div>
    </section>
  );
}
```

**Step 2: Verify template builds locally**

```bash
cd src/lib/sandbox/templates/property-showcase && pnpm install && pnpm build
```

Expected: build succeeds, `dist/index.html` is created as a single self-contained file.

```bash
cd src/lib/sandbox/templates/property-showcase && sh build.sh
```

Expected: `/tmp/output.html` is created.

If the build fails, fix the issue before proceeding. Common failure modes:
- `@tailwindcss/vite` not found: check `devDependencies` includes `@tailwindcss/vite`
- `vite-plugin-singlefile` version mismatch with Vite 6: ensure `vite-plugin-singlefile@^2.0.3`

**Step 3: Commit**

```bash
git add src/lib/sandbox/templates/property-showcase/
git commit -m "feat(pr53): add pre-scaffolded React property showcase template

7 components (Hero, PhotoGallery, PropertyDetails, NeighborhoodMap,
Comparables, AgentContact, MortgageCalc). Vite 6 + Tailwind 4 via
@tailwindcss/vite plugin. Dev server on port 8080. Single-file HTML
build via vite-plugin-singlefile. Visually neutral default theme."
```

---

## Task 2: Build `buildArtifactPrompt()` -- prompt construction for Claude CLI

The prompt builder is a pure function: given mode flags and data, it returns a prompt string. This is highly testable and should get real behavior-first coverage during implementation.

Three modes:
- **First run:** Copy template, customize with property data + skill preferences, property data at `/workspace/data/property.json`
- **Follow-up:** Iterate on existing code at `/workspace/app/`, apply requested changes
- **Ship-it:** Build static HTML via `build.sh`, output to `/tmp/output.html`

**Key decision:** The prompt does NOT tell Claude to "run npm run dev." The runner owns the service lifecycle.

**Files:**
- Create: `src/lib/sandbox/__tests__/artifact-prompt.test.ts`
- Create: `src/lib/sandbox/artifact-prompt.ts`

### Step 1: Write the failing tests

Create `src/lib/sandbox/__tests__/artifact-prompt.test.ts`:

```typescript
/**
 * Tests for artifact prompt building (first-run / follow-up / ship-it modes).
 * @module lib/sandbox/__tests__/artifact-prompt
 */
import { describe, expect, it } from "vitest";

import { buildArtifactPrompt } from "../artifact-prompt";

describe("buildArtifactPrompt", () => {
  describe("first-run mode (isFollowUp = false)", () => {
    it("includes template copy instruction", () => {
      const prompt = buildArtifactPrompt({
        task: "showcase page for 42 Noriega",
        photoFilenames: [],
        isFollowUp: false,
      });

      expect(prompt).toContain("Copy it to /workspace/app/");
      expect(prompt).toContain("/template");
    });

    it("includes property data path", () => {
      const prompt = buildArtifactPrompt({
        task: "showcase page",
        photoFilenames: [],
        isFollowUp: false,
      });

      expect(prompt).toContain("/workspace/data/property.json");
    });

    it("does NOT include dev server start instruction", () => {
      const prompt = buildArtifactPrompt({
        task: "showcase page",
        photoFilenames: [],
        isFollowUp: false,
      });

      // Runner owns the service lifecycle -- prompt must NOT tell Claude to start dev server
      expect(prompt).not.toContain("npm run dev");
      expect(prompt).not.toContain("start the dev server");
    });

    it("includes user skill read instruction when slug provided", () => {
      const prompt = buildArtifactPrompt({
        task: "showcase page",
        photoFilenames: [],
        userSkillSlug: "frontend-design",
        isFollowUp: false,
      });

      expect(prompt).toContain("/skills/frontend-design/SKILL.md");
    });

    it("omits skill instruction when no slug provided", () => {
      const prompt = buildArtifactPrompt({
        task: "showcase page",
        photoFilenames: [],
        isFollowUp: false,
      });

      expect(prompt).not.toContain("SKILL.md");
    });

    it("lists photo filenames when provided", () => {
      const prompt = buildArtifactPrompt({
        task: "showcase",
        photoFilenames: ["hero.jpg", "gallery1.jpg", "gallery2.jpg"],
        isFollowUp: false,
      });

      expect(prompt).toContain("hero.jpg");
      expect(prompt).toContain("gallery1.jpg");
      expect(prompt).toContain("gallery2.jpg");
      expect(prompt).toContain("/workspace/photos/");
    });

    it("includes the user task", () => {
      const prompt = buildArtifactPrompt({
        task: "build a luxury condo showcase with neighborhood map",
        photoFilenames: [],
        isFollowUp: false,
      });

      expect(prompt).toContain("build a luxury condo showcase with neighborhood map");
    });
  });

  describe("follow-up mode (isFollowUp = true)", () => {
    it("skips template copy instruction", () => {
      const prompt = buildArtifactPrompt({
        task: "swap the hero image",
        photoFilenames: [],
        isFollowUp: true,
      });

      expect(prompt).not.toContain("Copy it to /workspace/app");
      expect(prompt).not.toContain("/template");
    });

    it("references existing code at /workspace/app/", () => {
      const prompt = buildArtifactPrompt({
        task: "swap the hero image",
        photoFilenames: [],
        isFollowUp: true,
      });

      expect(prompt).toContain("/workspace/app/");
      expect(prompt).toContain("previous iteration");
    });

    it("does NOT include dev server restart instruction", () => {
      const prompt = buildArtifactPrompt({
        task: "swap the hero image",
        photoFilenames: [],
        isFollowUp: true,
      });

      expect(prompt).not.toContain("npm run dev");
    });

    it("includes the user task", () => {
      const prompt = buildArtifactPrompt({
        task: "swap the hero image to photo 3",
        photoFilenames: [],
        isFollowUp: true,
      });

      expect(prompt).toContain("swap the hero image to photo 3");
    });
  });

  describe("ship-it mode (shipIt = true)", () => {
    it("includes build instruction", () => {
      const prompt = buildArtifactPrompt({
        task: "finalize the page",
        photoFilenames: [],
        isFollowUp: true,
        shipIt: true,
      });

      expect(prompt).toContain("build.sh");
      expect(prompt).toContain("/tmp/output.html");
    });

    it("mentions signed-url publishing", () => {
      const prompt = buildArtifactPrompt({
        task: "ship it",
        photoFilenames: [],
        isFollowUp: true,
        shipIt: true,
      });

      expect(prompt).toContain("finalize");
    });
  });
});
```

### Step 2: Run test -- expect FAIL

```bash
npx vitest run src/lib/sandbox/__tests__/artifact-prompt.test.ts --reporter=verbose
```

Expected: FAIL -- `Cannot find module '../artifact-prompt'` because the implementation file does not exist yet.

### Step 3: Implement `buildArtifactPrompt`

Create `src/lib/sandbox/artifact-prompt.ts`:

```typescript
/**
 * Builds the prompt sent to Claude Code CLI inside a Sprite for artifact generation.
 *
 * Three modes:
 * - First run: copy pre-scaffolded template, customize with property data
 * - Follow-up: iterate on existing code
 * - Ship-it: build static HTML for 30-day signed URL publishing
 *
 * IMPORTANT: The prompt does NOT tell Claude to start a dev server.
 * The runner owns the service lifecycle via sprite.createService().
 *
 * @module lib/sandbox/artifact-prompt
 */

/** Options for building the artifact prompt. */
export interface ArtifactPromptOptions {
  /** What page to create or what changes to make. */
  task: string;
  /** Filenames of photos already written into /workspace/photos/. */
  photoFilenames: string[];
  /** Slug of the user's skill directory (e.g., "frontend-design"). */
  userSkillSlug?: string;
  /** True if this is a follow-up iteration (Sprite already has code from previous run). */
  isFollowUp: boolean;
  /** True if user wants to finalize -- build static HTML for a 30-day signed URL. */
  shipIt?: boolean;
}

/**
 * Builds the artifact generation prompt sent to Claude Code CLI.
 * Exported for testing -- the prompt varies based on first-run vs follow-up vs ship-it.
 */
export function buildArtifactPrompt(opts: ArtifactPromptOptions): string {
  const { task, photoFilenames, userSkillSlug, isFollowUp, shipIt } = opts;
  const lines: string[] = [];

  // Skill instructions (if user has a frontend-design SKILL.md)
  if (userSkillSlug) {
    lines.push(
      `Read /skills/${userSkillSlug}/SKILL.md for the user's brand and design preferences. Follow them.`,
    );
  }

  // Property data reference
  lines.push("Read /workspace/data/property.json for property details.");

  // Photo references
  if (photoFilenames.length > 0) {
    lines.push(`Photos are in /workspace/photos/: ${photoFilenames.join(", ")}`);
  }

  lines.push("");

  if (!isFollowUp) {
    // First run: copy template and customize
    lines.push("A React property showcase template is at /template/.");
    lines.push("Copy it to /workspace/app/ and customize:");
    lines.push("- Replace /workspace/app/src/data/property.json with real property data from /workspace/data/property.json");
    lines.push("- Update theme (colors, fonts, layout) per brand guidelines if a SKILL.md was provided");
    lines.push("- Swap placeholder images with actual photos (URL reference or base64 embed)");
    lines.push("- Add, remove, or modify sections as appropriate for this property");
  } else {
    // Follow-up: iterate on existing code
    lines.push("The React app is already at /workspace/app/ from a previous iteration.");
    lines.push("Modify the existing code to apply the requested changes.");
  }

  // Ship-it mode: build static HTML
  if (shipIt) {
    lines.push("");
    lines.push("IMPORTANT: The user wants to finalize this page for 30-day signed URL publishing.");
    lines.push("After making any final changes:");
    lines.push("- Run: cd /workspace/app && sh build.sh");
    lines.push("- Verify /tmp/output.html exists and is a valid self-contained HTML file");
  }

  lines.push("");
  lines.push(`Task: ${task}`);

  return lines.join("\n");
}
```

### Step 4: Run test -- expect PASS

```bash
npx vitest run src/lib/sandbox/__tests__/artifact-prompt.test.ts --reporter=verbose
```

Expected: ALL PASS (12 tests)

### Step 5: Commit

```bash
git add src/lib/sandbox/artifact-prompt.ts src/lib/sandbox/__tests__/artifact-prompt.test.ts
git commit -m "feat(pr53): add buildArtifactPrompt for Claude CLI prompt construction

Pure function with 3 modes: first-run (copy template), follow-up
(iterate existing), ship-it (build static HTML). Runner owns service
lifecycle -- prompt never tells Claude to start dev server."
```

---

## Task 3: Build `artifact-runner.ts` -- orchestration logic

This module orchestrates the full artifact generation flow:
1. Write user skill files into the Sprite filesystem
2. Write property data JSON to `/workspace/data/property.json`
3. Download photos on the runner, then write them into `/workspace/photos/`
4. Build Claude CLI args + env
5. Call `sprite.execFile()` to run Claude Code
6. Manage service lifecycle (create on first run, check/recover on follow-up)
7. Read built HTML on ship-it mode

It reuses:
- `getOrCreateSprite()` from PR 52's `src/lib/sandbox/sprites-client.ts`
- `findActiveSpriteSession()` / `upsertSpriteSession()` / `touchSpriteSession()` from PR 52's `src/lib/sandbox/sprite-session.ts`
- `loadSkillFilesForSandbox(supabase, clientId, slug)` from PR 52's `src/lib/sandbox/skill-loader.ts`
- `buildArtifactPrompt()` from Task 2

Each sub-function is tested independently.

**Files:**
- Create: `src/lib/sandbox/__tests__/artifact-runner.test.ts`
- Create: `src/lib/sandbox/artifact-runner.ts`

### Step 1: Write the failing tests

Create `src/lib/sandbox/__tests__/artifact-runner.test.ts`:

```typescript
/**
 * Tests for artifact runner orchestration.
 * Tests each sub-function independently: property data writing, photo downloading,
 * CLI args construction, env construction, service lifecycle, ship-it HTML reading.
 * @module lib/sandbox/__tests__/artifact-runner
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock the Sprite object ---
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockResolvedValue("<html>built page</html>");
const mockFilesystem = vi.fn().mockReturnValue({
  writeFile: mockWriteFile,
  readFile: mockReadFile,
});
const mockExecFile = vi.fn().mockResolvedValue({
  stdout: "Page built successfully",
  stderr: "",
  exitCode: 0,
});
const mockCreateService = vi.fn().mockResolvedValue({ id: "svc_dev" });
const mockUpdateURLSettings = vi.fn().mockResolvedValue(undefined);
const mockListServices = vi.fn().mockResolvedValue([]);

const mockSprite = {
  id: "sprite_test",
  url: "https://preview.example.test",
  filesystem: mockFilesystem,
  execFile: mockExecFile,
  createService: mockCreateService,
  updateURLSettings: mockUpdateURLSettings,
  listServices: mockListServices,
};

// --- Mock PR 52 dependencies ---
vi.mock("@/lib/sandbox/sprite-session", () => ({
  getOrCreateSprite: vi.fn().mockResolvedValue({
    sprite: mockSprite,
    isNew: true,
  }),
}));

vi.mock("@/lib/sandbox/skill-loader", () => ({
  loadSkillFilesForSandbox: vi.fn().mockResolvedValue([
    { path: "frontend-design/SKILL.md", content: "---\nname: Brand\ndescription: My brand\n---\nDark bg, gold accents" },
  ]),
}));

import {
  buildClaudeCliArgs,
  buildClaudeEnv,
  writePropertyDataToSprite,
  downloadPhotosToSprite,
  ensureDevServerService,
  readBuiltHtml,
  type SpriteHandle,
} from "../artifact-runner";

describe("buildClaudeCliArgs", () => {
  it("includes --dangerously-skip-permissions flag", () => {
    const args = buildClaudeCliArgs({ prompt: "build a page", maxTurns: 20 });
    expect(args).toContain("--dangerously-skip-permissions");
  });

  it("uses --print flag for non-interactive output", () => {
    const args = buildClaudeCliArgs({ prompt: "build a page", maxTurns: 20 });
    expect(args).toContain("--print");
  });

  it("passes prompt via -p flag", () => {
    const args = buildClaudeCliArgs({ prompt: "build a showcase", maxTurns: 20 });
    const pIndex = args.indexOf("-p");
    expect(pIndex).toBeGreaterThan(-1);
    expect(args[pIndex + 1]).toBe("build a showcase");
  });

  it("sets --max-turns from parameter", () => {
    const args = buildClaudeCliArgs({ prompt: "test", maxTurns: 15 });
    const mtIndex = args.indexOf("--max-turns");
    expect(mtIndex).toBeGreaterThan(-1);
    expect(args[mtIndex + 1]).toBe("15");
  });

  it("includes --allowedTools with correct tool list", () => {
    const args = buildClaudeCliArgs({ prompt: "test", maxTurns: 20 });
    const atIndex = args.indexOf("--allowedTools");
    expect(atIndex).toBeGreaterThan(-1);
    const toolList = args[atIndex + 1];
    expect(toolList).toContain("Read");
    expect(toolList).toContain("Write");
    expect(toolList).toContain("Edit");
    expect(toolList).toContain("Bash");
  });

  it("returns an array (not a string) for use with execFile", () => {
    const args = buildClaudeCliArgs({ prompt: "test", maxTurns: 20 });
    expect(Array.isArray(args)).toBe(true);
    args.forEach((arg) => expect(typeof arg).toBe("string"));
  });
});

describe("buildClaudeEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ANTHROPIC_API_KEY: "sk-test-key",
      PATH: "/usr/bin:/usr/local/bin",
    };
  });

  it("includes ANTHROPIC_API_KEY from process.env", () => {
    const env = buildClaudeEnv();
    expect(env.ANTHROPIC_API_KEY).toBe("sk-test-key");
  });

  it("includes PATH from process.env", () => {
    const env = buildClaudeEnv();
    expect(env.PATH).toBe("/usr/bin:/usr/local/bin");
  });

  it("includes ANTHROPIC_BASE_URL (empty string if not set)", () => {
    delete process.env.ANTHROPIC_BASE_URL;
    const env = buildClaudeEnv();
    expect(env.ANTHROPIC_BASE_URL).toBe("");
  });

  it("includes ANTHROPIC_BASE_URL when set", () => {
    process.env.ANTHROPIC_BASE_URL = "https://proxy.example.com";
    const env = buildClaudeEnv();
    expect(env.ANTHROPIC_BASE_URL).toBe("https://proxy.example.com");
  });

  it("throws when ANTHROPIC_API_KEY is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => buildClaudeEnv()).toThrow("ANTHROPIC_API_KEY");
  });

  afterEach(() => {
    process.env = originalEnv;
  });
});

describe("writePropertyDataToSprite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes JSON to /workspace/data/property.json via filesystem()", async () => {
    const propertyData = { address: "42 Noriega", price: 1800000 };
    await writePropertyDataToSprite(mockSprite as unknown as SpriteHandle, propertyData);

    expect(mockFilesystem).toHaveBeenCalledWith("/workspace/data");
    expect(mockWriteFile).toHaveBeenCalledWith(
      "property.json",
      JSON.stringify(propertyData, null, 2),
    );
  });

  it("serializes nested objects correctly", async () => {
    const propertyData = {
      address: "42 Noriega",
      neighborhood: { name: "Bukit Timah", schools: ["NP", "RGS"] },
    };
    await writePropertyDataToSprite(mockSprite as unknown as SpriteHandle, propertyData);

    const writtenContent = mockWriteFile.mock.calls[0][1];
    const parsed = JSON.parse(writtenContent);
    expect(parsed.neighborhood.schools).toEqual(["NP", "RGS"]);
  });
});

describe("downloadPhotosToSprite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates /workspace/photos/ directory", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode("img-1")),
    }) as any;
    await downloadPhotosToSprite(mockSprite as unknown as SpriteHandle, [
      "https://example.com/photo1.jpg",
    ]);

    expect(mockExecFile).toHaveBeenCalledWith(
      "mkdir",
      ["-p", "/workspace/photos"],
    );
  });

  it("downloads each photo on the runner and writes it into the Sprite", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode("img-1")),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode("img-2")),
      }) as any;
    const urls = [
      "https://example.com/a.jpg",
      "https://example.com/b.jpg",
    ];
    const filenames = await downloadPhotosToSprite(mockSprite as unknown as SpriteHandle, urls);

    expect(filenames).toEqual(["photo-1.jpg", "photo-2.jpg"]);
    expect(global.fetch).toHaveBeenCalledWith("https://example.com/a.jpg");
    expect(global.fetch).toHaveBeenCalledWith("https://example.com/b.jpg");
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(mockWriteFile).toHaveBeenCalledWith(
      "photo-1.jpg",
      expect.any(Buffer),
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      "photo-2.jpg",
      expect.any(Buffer),
    );
  });

  it("returns empty array when no URLs provided", async () => {
    const filenames = await downloadPhotosToSprite(mockSprite as unknown as SpriteHandle, []);
    expect(filenames).toEqual([]);
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});

describe("ensureDevServerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new service on first run (isNew = true)", async () => {
    await ensureDevServerService(mockSprite as unknown as SpriteHandle, true);

    expect(mockCreateService).toHaveBeenCalledWith("dev-server", {
      cmd: "bash",
      args: ["-lc", "cd /workspace/app && npm run dev"],
    });
    expect(mockUpdateURLSettings).toHaveBeenCalledWith({ auth: "public" });
  });

  it("checks for existing service on follow-up (isNew = false)", async () => {
    mockListServices.mockResolvedValueOnce([{ name: "dev-server", status: "running" }]);

    await ensureDevServerService(mockSprite as unknown as SpriteHandle, false);

    expect(mockListServices).toHaveBeenCalled();
    // Service exists and is running -- no new service created
    expect(mockCreateService).not.toHaveBeenCalled();
  });

  it("recreates service if not found on follow-up", async () => {
    mockListServices.mockResolvedValueOnce([]);

    await ensureDevServerService(mockSprite as unknown as SpriteHandle, false);

    expect(mockListServices).toHaveBeenCalled();
    expect(mockCreateService).toHaveBeenCalledWith("dev-server", {
      cmd: "bash",
      args: ["-lc", "cd /workspace/app && npm run dev"],
    });
  });

  it("always sets URL auth to public", async () => {
    await ensureDevServerService(mockSprite as unknown as SpriteHandle, true);
    expect(mockUpdateURLSettings).toHaveBeenCalledWith({ auth: "public" });
  });
});

describe("readBuiltHtml", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads from /tmp/output.html via filesystem()", async () => {
    const html = await readBuiltHtml(mockSprite as unknown as SpriteHandle);

    expect(mockFilesystem).toHaveBeenCalledWith("/tmp");
    expect(mockReadFile).toHaveBeenCalledWith("output.html");
    expect(html).toBe("<html>built page</html>");
  });
});
```

### Step 2: Run test -- expect FAIL

```bash
npx vitest run src/lib/sandbox/__tests__/artifact-runner.test.ts --reporter=verbose
```

Expected: FAIL -- `Cannot find module '../artifact-runner'` because the implementation file does not exist yet.

### Step 3: Implement `artifact-runner.ts`

Create `src/lib/sandbox/artifact-runner.ts`:

```typescript
/**
 * Orchestrates artifact generation inside a Sprite (Fly.io).
 *
 * Responsibilities:
 * - Write property data + photos + skill files into the Sprite filesystem
 * - Build Claude CLI args and env
 * - Call sprite.execFile('claude', [...args], { env }) to run Claude Code
 * - Manage dev server service lifecycle (create, check, recover)
 * - Read built HTML on ship-it mode
 *
 * Each sub-function is exported for unit testing.
 *
 * SDK corrections applied:
 * - Uses execFile() with arg arrays, not exec() (exec splits on whitespace)
 * - ANTHROPIC_API_KEY passed per-command via env option, not written to Sprite config
 * - Uses createService() for dev server (Services survive hibernation, sessions don't)
 * - Uses bash -lc wrapper for createService cmd (cwd may not be supported in rc37)
 *
 * @module lib/sandbox/artifact-runner
 */
import type { SpriteSkillFile } from "./types";

/**
 * Minimal Sprite handle interface used by this module.
 * Avoids a hard import of the full Sprite type from @fly/sprites -- keeps tests simple
 * and lets us mock without importing the SDK.
 */
export interface SpriteHandle {
  id: string;
  url: string;
  filesystem: (basePath: string) => {
    writeFile: (path: string, content: string | Buffer) => Promise<void>;
    readFile: (path: string, encoding?: null) => Promise<string | Buffer>;
  };
  execFile: (
    cmd: string,
    args: string[],
    opts?: { env?: Record<string, string> },
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  createService: (
    name: string,
    opts: { cmd: string; args: string[] },
  ) => Promise<{ id: string }>;
  updateURLSettings: (settings: { auth: string }) => Promise<void>;
  listServices: () => Promise<Array<{ name: string; status: string }>>;
}

/** Tools that Claude Code CLI is allowed to use inside the Sprite. */
const ALLOWED_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep"];

/** Default max turns for Claude Code CLI inside the Sprite. */
const DEFAULT_MAX_TURNS = 20;

/** Service name for the artifact dev server. */
const DEV_SERVER_SERVICE_NAME = "dev-server";

/**
 * Builds the argument array for `sprite.execFile('claude', args)`.
 * Returns a string array -- NOT a single command string -- because
 * the Sprites SDK `exec()` does a naive whitespace split that breaks
 * long prompts. `execFile()` with an arg array is the correct pattern.
 */
export function buildClaudeCliArgs(opts: {
  prompt: string;
  maxTurns?: number;
}): string[] {
  const { prompt, maxTurns = DEFAULT_MAX_TURNS } = opts;

  return [
    "--print",
    "--dangerously-skip-permissions",
    "--allowedTools", ALLOWED_TOOLS.join(","),
    "--max-turns", String(maxTurns),
    "-p", prompt,
  ];
}

/**
 * Builds the environment variable object passed per-command to Claude Code CLI.
 * ANTHROPIC_API_KEY is injected per-command -- NOT written to Sprite config.
 * This is the safest verified pattern per the SDK verification findings.
 *
 * @throws {Error} if ANTHROPIC_API_KEY is not set in process.env
 */
export function buildClaudeEnv(): Record<string, string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required but not set in environment.");
  }

  return {
    ANTHROPIC_API_KEY: apiKey,
    PATH: process.env.PATH ?? "/usr/bin:/usr/local/bin",
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL ?? "",
  };
}

/**
 * Writes property data JSON into the Sprite filesystem at /workspace/data/property.json.
 * Uses rc37 filesystem() which auto-creates parent directories on writeFile().
 */
export async function writePropertyDataToSprite(
  sprite: SpriteHandle,
  propertyData: Record<string, unknown>,
): Promise<void> {
  const fs = sprite.filesystem("/workspace/data");
  await fs.writeFile("property.json", JSON.stringify(propertyData, null, 2));
}

/**
 * Downloads photos on the runner, then writes them into the Sprite. Returns filenames.
 * This keeps Sprite egress tightly allowlisted — the Sprite never curls external URLs.
 */
export async function downloadPhotosToSprite(
  sprite: SpriteHandle,
  photoUrls: string[],
): Promise<string[]> {
  if (photoUrls.length === 0) return [];

  await sprite.execFile("mkdir", ["-p", "/workspace/photos"]);
  const fs = sprite.filesystem("/workspace/photos");

  const filenames: string[] = [];
  for (let i = 0; i < photoUrls.length; i++) {
    const filename = `photo-${i + 1}.jpg`;
    const response = await fetch(photoUrls[i]);
    if (!response.ok) {
      throw new Error(`Failed to download photo: ${photoUrls[i]}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(filename, buffer);
    filenames.push(filename);
  }

  return filenames;
}

/**
 * Writes user skill files into the Sprite filesystem under /skills/.
 * rc37 filesystem() auto-creates parent directories on writeFile().
 */
export async function writeSkillFilesToSprite(
  sprite: SpriteHandle,
  skillFiles: SpriteSkillFile[],
): Promise<void> {
  if (skillFiles.length === 0) return;

  const fs = sprite.filesystem("/skills");
  for (const file of skillFiles) {
    await fs.writeFile(file.path, file.content);
  }
}

/**
 * Ensures the dev server Service is running.
 *
 * On first run (isNew = true): creates the Service and sets URL auth to public.
 * On follow-up (isNew = false): checks if Service exists, recreates if needed.
 *
 * Uses `bash -lc` wrapper instead of a `cwd` option because rc37's createService
 * may not support `cwd`. The Service runs `cd /workspace/app && npm run dev`.
 *
 * Services survive hibernation -- unlike detached sessions which are lost on sleep/wake.
 */
export async function ensureDevServerService(
  sprite: SpriteHandle,
  isNew: boolean,
): Promise<void> {
  if (!isNew) {
    // Check if service already exists
    const services = await sprite.listServices();
    const existing = services.find((s) => s.name === DEV_SERVER_SERVICE_NAME);
    if (existing) {
      // Service exists -- it survives hibernation, so it should still be running
      await sprite.updateURLSettings({ auth: "public" });
      return;
    }
    // Service not found -- recreate it (Sprite may have been reclaimed)
  }

  await sprite.createService(DEV_SERVER_SERVICE_NAME, {
    cmd: "bash",
    args: ["-lc", "cd /workspace/app && npm run dev"],
  });
  await sprite.updateURLSettings({ auth: "public" });
}

/**
 * Reads the built static HTML from /tmp/output.html after ship-it mode.
 */
export async function readBuiltHtml(sprite: SpriteHandle): Promise<string> {
  const fs = sprite.filesystem("/tmp");
  const content = await fs.readFile("output.html");
  return typeof content === "string" ? content : content.toString();
}

/**
 * Writes the pre-scaffolded template files from the repo into the Sprite.
 * Only called on first run. Reads source files from the committed template
 * directory and writes them to /template/ inside the Sprite.
 */
export async function writeTemplateToSprite(
  sprite: SpriteHandle,
  templateFiles: Array<{ relativePath: string; content: string }>,
): Promise<void> {
  const fs = sprite.filesystem("/template");
  for (const file of templateFiles) {
    await fs.writeFile(file.relativePath, file.content);
  }
}

/**
 * Installs npm dependencies inside the Sprite at /template/.
 * Called once on first run. Dependencies persist across hibernation.
 */
export async function installTemplateDeps(sprite: SpriteHandle): Promise<void> {
  await sprite.execFile("bash", ["-lc", "cd /template && npm install"]);
}

/** Options for the full artifact run. */
export interface RunArtifactOptions {
  sprite: SpriteHandle;
  task: string;
  propertyData: Record<string, unknown>;
  photoUrls: string[];
  skillFiles: SpriteSkillFile[];
  userSkillSlug?: string;
  isNew: boolean;
  shipIt?: boolean;
  maxTurns?: number;
}

/** Result of a full artifact run. */
export interface RunArtifactResult {
  success: boolean;
  previewUrl: string;
  summary: string;
  builtHtml?: string;
}
```

### Step 4: Run test -- expect PASS

```bash
npx vitest run src/lib/sandbox/__tests__/artifact-runner.test.ts --reporter=verbose
```

Expected: ALL PASS

### Step 5: Commit

```bash
git add src/lib/sandbox/artifact-runner.ts src/lib/sandbox/__tests__/artifact-runner.test.ts
git commit -m "feat(pr53): add artifact-runner orchestration module

Exported sub-functions: buildClaudeCliArgs, buildClaudeEnv,
writePropertyDataToSprite, downloadPhotosToSprite, ensureDevServerService,
readBuiltHtml. Uses bash -lc for createService (cwd may not be supported
in rc37). Each function independently tested."
```

---

## Task 4: Build the `publish_artifact` tool factory

The tool factory follows the AI SDK v6 `tool({ inputSchema, execute })` pattern (see `src/lib/runner/tools/utility/generate-pdf.ts` for a real example in this codebase). It composes the sub-functions from Tasks 2-3 into a complete tool.

**Key decisions:**
- Per-thread Sprite via the explicit PR 52 split: `findActiveSpriteSession()` + `getOrCreateSprite()`
- Skill files loaded via `loadSkillFilesForSandbox()` from PR 52
- Template files written on first run, then `npm install` runs explicitly inside the Sprite
- Publishing uses Supabase Storage signed URL (30-day expiry, not permanent)
- Output uploaded via `createAgentFileClient().uploadArtifact()` for DRY storage handling

**Files:**
- Create: `src/lib/runner/tools/sandbox/__tests__/publish-artifact.test.ts`
- Create: `src/lib/runner/tools/sandbox/publish-artifact.ts`

### Step 1: Write the failing tests

Create `src/lib/runner/tools/sandbox/__tests__/publish-artifact.test.ts`:

```typescript
/**
 * Tests for the publish_artifact tool factory.
 * @module lib/runner/tools/sandbox/__tests__/publish-artifact
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock Sprite and PR 52 dependencies ---
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockResolvedValue("<html>built</html>");
const mockFilesystem = vi.fn().mockReturnValue({
  writeFile: mockWriteFile,
  readFile: mockReadFile,
});
const mockExecFile = vi.fn().mockResolvedValue({
  stdout: "Page built successfully",
  stderr: "",
  exitCode: 0,
});
const mockCreateService = vi.fn().mockResolvedValue({ id: "svc_dev" });
const mockUpdateURLSettings = vi.fn().mockResolvedValue(undefined);
const mockListServices = vi.fn().mockResolvedValue([]);

const mockSprite = {
  id: "sprite_test",
  url: "https://preview.example.test",
  filesystem: mockFilesystem,
  execFile: mockExecFile,
  createService: mockCreateService,
  updateURLSettings: mockUpdateURLSettings,
  listServices: mockListServices,
};

vi.mock("@/lib/sandbox/sprite-session", () => ({
  findActiveSpriteSession: vi.fn().mockResolvedValue(null),
  upsertSpriteSession: vi.fn().mockResolvedValue(undefined),
  touchSpriteSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/sandbox/sprites-client", () => ({
  getOrCreateSprite: vi.fn().mockResolvedValue({
    sprite: mockSprite,
    spriteName: "thread-thread_",
    isNew: true,
  }),
}));

vi.mock("@/lib/sandbox/skill-loader", () => ({
  loadSkillFilesForSandbox: vi.fn().mockResolvedValue([]),
}));

const mockUploadArtifact = vi.fn().mockResolvedValue({
  storagePath: "client_1/artifacts/page.html",
  downloadUrl: "https://storage.example.com/signed/artifact.html?token=abc",
});
const mockSupabase = {} as never;

import { findActiveSpriteSession } from "@/lib/sandbox/sprite-session";
import { getOrCreateSprite } from "@/lib/sandbox/sprites-client";
import { createPublishArtifactTool } from "../publish-artifact";

describe("createPublishArtifactTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateSprite).mockResolvedValue({
      sprite: mockSprite as never,
      spriteName: "thread-thread_",
      isNew: true,
    });
    process.env.ANTHROPIC_API_KEY = "sk-test-key";
    process.env.PATH = "/usr/bin";
  });

  describe("tool shape", () => {
    it("returns an object with description, inputSchema, and execute", () => {
      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      const tool = tools.publish_artifact;
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it("description mentions web page and preview", () => {
      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      expect(tools.publish_artifact.description).toContain("web page");
      expect(tools.publish_artifact.description).toContain("preview");
    });
  });

  describe("inputSchema validation", () => {
    it("accepts valid input with task and propertyData", () => {
      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      const schema = tools.publish_artifact.inputSchema;
      const parsed = schema.parse({
        task: "build a showcase",
        propertyData: { address: "42 Noriega" },
      });
      expect(parsed.task).toBe("build a showcase");
      expect(parsed.propertyData).toEqual({ address: "42 Noriega" });
    });

    it("accepts optional photoUrls and shipIt", () => {
      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      const schema = tools.publish_artifact.inputSchema;
      const parsed = schema.parse({
        task: "build a showcase",
        propertyData: { address: "42 Noriega" },
        photoUrls: ["https://example.com/photo1.jpg"],
        shipIt: true,
      });
      expect(parsed.photoUrls).toEqual(["https://example.com/photo1.jpg"]);
      expect(parsed.shipIt).toBe(true);
    });

    it("rejects missing task", () => {
      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      expect(() =>
        tools.publish_artifact.inputSchema.parse({ propertyData: { address: "42 Noriega" } }),
      ).toThrow();
    });

    it("rejects missing propertyData", () => {
      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      expect(() =>
        tools.publish_artifact.inputSchema.parse({ task: "build a showcase" }),
      ).toThrow();
    });
  });

  describe("execute -- first run", () => {
    it("returns preview URL on successful first run", async () => {
      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      const result = await tools.publish_artifact.execute({
        task: "build a showcase for 42 Noriega",
        propertyData: { address: "42 Noriega Street", price: 1800000 },
      });

      expect(result).toMatchObject({
        success: true,
        previewUrl: "https://preview.example.test",
        published: false,
      });
    });

    it("looks up the thread session before waking or creating a Sprite", async () => {
      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_42");
      await tools.publish_artifact.execute({
        task: "build a showcase",
        propertyData: { address: "42 Noriega" },
      });

      expect(findActiveSpriteSession).toHaveBeenCalledWith(mockSupabase, "thread_42");
      expect(getOrCreateSprite).toHaveBeenCalledWith(
        expect.objectContaining({ spriteName: "thread-thread_4" }),
      );
    });

    it("writes property data to Sprite filesystem", async () => {
      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      await tools.publish_artifact.execute({
        task: "build a showcase",
        propertyData: { address: "42 Noriega", price: 1800000 },
      });

      expect(mockFilesystem).toHaveBeenCalledWith("/workspace/data");
      expect(mockWriteFile).toHaveBeenCalledWith(
        "property.json",
        expect.stringContaining("42 Noriega"),
      );
    });

    it("creates dev server Service on first run", async () => {
      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      await tools.publish_artifact.execute({
        task: "build a showcase",
        propertyData: { address: "42 Noriega" },
      });

      expect(mockCreateService).toHaveBeenCalledWith("dev-server", expect.any(Object));
      expect(mockUpdateURLSettings).toHaveBeenCalledWith({ auth: "public" });
    });

    it("runs Claude Code CLI via execFile with arg array", async () => {
      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      await tools.publish_artifact.execute({
        task: "build a showcase",
        propertyData: { address: "42 Noriega" },
      });

      expect(mockExecFile).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining(["--dangerously-skip-permissions", "--print", "-p"]),
        expect.objectContaining({
          env: expect.objectContaining({ ANTHROPIC_API_KEY: "sk-test-key" }),
        }),
      );
    });
  });

  describe("execute -- follow-up", () => {
    it("sets isFollowUp in prompt when Sprite already exists", async () => {
      vi.mocked(getOrCreateSprite).mockResolvedValueOnce({
        sprite: mockSprite as never,
        isNew: false,
      });
      mockListServices.mockResolvedValueOnce([{ name: "dev-server", status: "running" }]);

      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      await tools.publish_artifact.execute({
        task: "swap the hero image",
        propertyData: { address: "42 Noriega" },
      });

      // Should NOT contain template copy instruction in the prompt
      const claudeCall = mockExecFile.mock.calls.find((c) => c[0] === "claude");
      expect(claudeCall).toBeDefined();
      const promptArg = claudeCall![1];
      const pIndex = promptArg.indexOf("-p");
      const prompt = promptArg[pIndex + 1];
      expect(prompt).not.toContain("Copy it to /workspace/app");
      expect(prompt).toContain("previous iteration");
    });
  });

  describe("execute -- ship-it", () => {
    it("uploads built HTML to Supabase Storage and returns signed URL", async () => {
      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      const result = await tools.publish_artifact.execute({
        task: "finalize the page",
        propertyData: { address: "42 Noriega Street" },
        shipIt: true,
      });

      expect(result).toMatchObject({
        success: true,
        published: true,
      });
      expect(result.url).toContain("signed");
      expect(mockUploadArtifact).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: "text/html",
          expiresInSeconds: expect.any(Number),
        }),
      );
    });

    it("includes signed URL expiry caveat in result", async () => {
      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      const result = await tools.publish_artifact.execute({
        task: "finalize",
        propertyData: { address: "42 Noriega" },
        shipIt: true,
      });

      // Result should indicate the URL expires
      expect(result.published).toBe(true);
    });
  });

  describe("execute -- error handling", () => {
    it("returns error when Claude Code CLI fails (non-zero exit)", async () => {
      mockExecFile.mockRejectedValueOnce(
        Object.assign(new Error("Process exited with code 1"), {
          stdout: "Error: compilation failed",
          stderr: "build error",
          exitCode: 1,
        }),
      );

      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      const result = await tools.publish_artifact.execute({
        task: "build a showcase",
        propertyData: { address: "42 Noriega" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("returns error when Sprite creation fails", async () => {
      vi.mocked(getOrCreateSprite).mockRejectedValueOnce(
        new Error("Sprites API rate limited"),
      );

      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      const result = await tools.publish_artifact.execute({
        task: "build a showcase",
        propertyData: { address: "42 Noriega" },
      });

      expect(result).toEqual({
        success: false,
        error: "Sprites API rate limited",
      });
    });

    it("returns error when artifact upload fails on ship-it", async () => {
      mockUploadArtifact.mockRejectedValueOnce(new Error("Storage quota exceeded"));

      const tools = createPublishArtifactTool(mockSupabase, "client_1", "thread_1");
      const result = await tools.publish_artifact.execute({
        task: "finalize",
        propertyData: { address: "42 Noriega" },
        shipIt: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Storage quota exceeded");
    });
  });
});
```

### Step 2: Run test -- expect FAIL

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/publish-artifact.test.ts --reporter=verbose
```

Expected: FAIL -- `Cannot find module '../publish-artifact'` because the implementation file does not exist yet.

### Step 3: Implement the tool factory

Create `src/lib/runner/tools/sandbox/publish-artifact.ts`:

```typescript
/**
 * `publish_artifact` tool -- generates and publishes web pages (property showcases,
 * pitch pages, neighborhood guides) inside a persistent per-thread Sprite (Fly.io).
 *
 * Multi-turn iteration: same Sprite, same files, user refines in follow-up messages.
 * Returns a live preview URL on each iteration.
 * Ship-it mode: builds static HTML, uploads via createAgentFileClient() signed URL (30-day expiry).
 *
 * SDK corrections applied:
 * - Uses execFile() with arg arrays, not exec() (exec splits on whitespace)
 * - Uses createService() for dev server (Services survive hibernation, sessions don't)
 * - Uses bash -lc wrapper for cwd (rc37 createService may not support cwd)
 * - Calls updateURLSettings({ auth: 'public' }) (preview URLs private by default)
 * - Reads preview URL from sprite.url (not hardcoded -- domain drift between .app/.dev)
 * - Pins @fly/sprites@0.0.1-rc37 (stable 0.0.1 lacks filesystem/services/policy APIs)
 *
 * @module lib/runner/tools/sandbox/publish-artifact
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { createAgentFileClient } from "@/lib/storage/agent-files";
import { buildArtifactPrompt } from "@/lib/sandbox/artifact-prompt";
import {
  buildClaudeCliArgs,
  buildClaudeEnv,
  downloadPhotosToSprite,
  ensureDevServerService,
  readBuiltHtml,
  writePropertyDataToSprite,
  writeSkillFilesToSprite,
  writeTemplateToSprite,
  installTemplateDeps,
  type SpriteHandle,
} from "@/lib/sandbox/artifact-runner";
import { PROPERTY_SHOWCASE_TEMPLATE_FILES } from "@/lib/sandbox/templates/property-showcase/template-files";
import { getOrCreateSprite } from "@/lib/sandbox/sprites-client";
import {
  findActiveSpriteSession,
  touchSpriteSession,
  upsertSpriteSession,
} from "@/lib/sandbox/sprite-session";
import { loadSkillFilesForSandbox } from "@/lib/sandbox/skill-loader";
import type { Database } from "@/types/database";

/** Signed URL expiry: 30 days in seconds. */
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 30;

/**
 * Sanitizes a string into a safe filename slug.
 * Lowercases, replaces non-alphanumeric chars with dashes, trims, truncates.
 */
function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/**
 * Creates the `publish_artifact` tool bound to a client and thread.
 * Uses AI SDK v6 `tool({ inputSchema, execute })` pattern.
 *
 * @param supabase - Authenticated Supabase client for storage uploads.
 * @param clientId - Tenant identifier for storage paths and skill loading.
 * @param threadId - Thread identifier for per-thread Sprite lookup.
 */
export function createPublishArtifactTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
) {
  const publish_artifact = tool({
    description:
      "Generate and publish a web page -- property showcases, pitch pages, " +
      "neighborhood guides, or open house landing pages. The page is built from a " +
      "pre-scaffolded React template inside a persistent Sprite, customized by Claude Code. " +
      "Returns a live preview URL. Supports multi-turn iteration -- user can refine the page " +
      "in follow-up messages. Use AFTER gathering property data via CRM/search/browser tools. " +
      "Set shipIt=true only when the user explicitly asks to finalize for a 30-day signed URL.",
    inputSchema: z.object({
      task: z.string().describe("What page to create or what changes to make"),
      propertyData: z.record(z.unknown()).describe("Property details assembled from CRM/search"),
      photoUrls: z.array(z.string()).optional().describe("Photo URLs to include"),
      shipIt: z.boolean().optional().describe("Set true to build final static HTML for signed URL (30-day expiry)"),
    }),
    execute: async ({
      task,
      propertyData,
      photoUrls = [],
      shipIt = false,
    }) => {
      try {
        const token = process.env.SPRITES_TOKEN;
        if (!token) {
          return {
            success: false as const,
            error: "Missing SPRITES_TOKEN environment variable",
          };
        }

        const existingSession = await findActiveSpriteSession(supabase, threadId);
        const spriteName = `thread-${threadId.slice(0, 8)}`;

        // 1. Get or create the thread-scoped Sprite (wake if sleeping, create if new)
        const { sprite: rawSprite, spriteName: resolvedName, isNew } = await getOrCreateSprite({
          token,
          existingSpriteName: existingSession?.sprite_name,
          spriteName,
        });
        const sprite = rawSprite as unknown as SpriteHandle;
        const agentFiles = createAgentFileClient(supabase, clientId);

        await upsertSpriteSession(supabase, {
          client_id: clientId,
          thread_id: threadId,
          sprite_name: resolvedName,
          status: "running",
        });

        // 2. On first run, write template files and install deps
        if (isNew) {
          await writeTemplateToSprite(sprite, PROPERTY_SHOWCASE_TEMPLATE_FILES);
          await installTemplateDeps(sprite);
        }

        // 3. Write property data to Sprite (always -- data may have changed)
        await writePropertyDataToSprite(sprite, propertyData);

        // 4. Download photos (skip if no URLs)
        const photoFilenames = await downloadPhotosToSprite(sprite, photoUrls);

        // 5. Load and write user skill files from Supabase Storage
        const skillFiles = await loadSkillFilesForSandbox(
          supabase,
          clientId,
          "frontend-design",
        );
        await writeSkillFilesToSprite(sprite, skillFiles);

        // 6. Build prompt and run Claude Code CLI
        const prompt = buildArtifactPrompt({
          task,
          photoFilenames,
          userSkillSlug: skillFiles.length > 0 ? "frontend-design" : undefined,
          isFollowUp: !isNew,
          shipIt,
        });

        const cliArgs = buildClaudeCliArgs({ prompt });
        const env = buildClaudeEnv();

        const cliResult = await sprite.execFile("claude", cliArgs, { env });
        const summary = typeof cliResult.stdout === "string"
          ? cliResult.stdout.slice(0, 500)
          : String(cliResult.stdout).slice(0, 500);

        // 7. Ensure dev server is running
        await ensureDevServerService(sprite, isNew);

        // 8. Ship-it: build static HTML, upload via shared agent file abstraction
        if (shipIt) {
          // Build was triggered inside Claude CLI by the prompt (build.sh)
          const htmlContent = await readBuiltHtml(sprite);

          const slug = sanitizeSlug((propertyData.address as string) ?? "page");
          const artifact = await agentFiles.uploadArtifact({
            filename: `${slug}-${Date.now()}.html`,
            content: htmlContent,
            contentType: "text/html",
            expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS,
          });

          return {
            success: true as const,
            url: artifact.downloadUrl,
            previewUrl: sprite.url,
            summary,
            published: true,
          };
        }

        await touchSpriteSession(supabase, threadId);

        // 9. Return live preview URL (read from sprite.url, not hardcoded)
        return {
          success: true as const,
          previewUrl: sprite.url,
          summary,
          published: false,
        };
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  return { publish_artifact };
}
```

### Step 4: Run test -- expect PASS

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/publish-artifact.test.ts --reporter=verbose
```

Expected: ALL PASS

### Step 5: Commit

```bash
git add src/lib/runner/tools/sandbox/publish-artifact.ts src/lib/runner/tools/sandbox/__tests__/publish-artifact.test.ts
git commit -m "feat(pr53): add publish_artifact tool factory

AI SDK v6 tool({ inputSchema, execute }) pattern. Per-thread Sprite via
explicit sprite-session + sprites-client helpers. Runner owns service lifecycle. Ship-it
uploads to Supabase Storage signed URL (30-day expiry). Comprehensive
test coverage: schema validation, first run, follow-up, ship-it, errors."
```

---

## Task 5: Register `publish_artifact` in tool registry

Follows the existing pattern in `src/lib/runner/tool-registry.ts` where each tool category has a factory function. The `publish_artifact` tool is gated on the shared `isSandboxConfigured()` helper from PR 52 (`SPRITES_TOKEN`) -- if not set, it's excluded from the registry.

**Files:**
- Modify: `src/lib/runner/tool-registry.ts`
- Modify: `src/lib/runner/__tests__/tool-registry.test.ts`

### Step 1: Write the failing test

Add a new test to `src/lib/runner/__tests__/tool-registry.test.ts`. Add the mock and test after the existing imports and describe block:

```typescript
// Add to the vi.hoisted block:
const mockCreatePublishArtifactTool = vi.fn();

// Add to the vi.mock block (new mock):
vi.mock("@/lib/runner/tools/sandbox/publish-artifact", () => ({
  createPublishArtifactTool: mockCreatePublishArtifactTool,
}));

// Add to beforeEach:
mockCreatePublishArtifactTool.mockReturnValue({
  publish_artifact: { description: "sandbox-tool" },
});

// Add new test:
it("includes publish_artifact when SPRITES_TOKEN is set", () => {
  process.env.SPRITES_TOKEN = "test-key";

  const tools = createRunnerTools(
    "supabase" as never,
    "client-id",
    "thread-id",
  );

  expect(tools).toHaveProperty("publish_artifact");
  expect(mockCreatePublishArtifactTool).toHaveBeenCalledWith(
    "supabase",
    "client-id",
    "thread-id",
  );

  delete process.env.SPRITES_TOKEN;
});

it("omits publish_artifact when SPRITES_TOKEN is not set", () => {
  delete process.env.SPRITES_TOKEN;

  const tools = createRunnerTools(
    "supabase" as never,
    "client-id",
    "thread-id",
  );

  expect(tools).not.toHaveProperty("publish_artifact");
});

it("omits publish_artifact for subagents", () => {
  process.env.SPRITES_TOKEN = "test-key";

  const tools = createRunnerTools(
    "supabase" as never,
    "client-id",
    "thread-id",
    { isSubagent: true },
  );

  expect(tools).not.toHaveProperty("publish_artifact");

  delete process.env.SPRITES_TOKEN;
});
```

### Step 2: Run test -- expect FAIL

```bash
npx vitest run src/lib/runner/__tests__/tool-registry.test.ts --reporter=verbose
```

Expected: FAIL -- `publish_artifact` is not included in the tool registry because it hasn't been imported/registered yet.

### Step 3: Add import and registration

In `src/lib/runner/tool-registry.ts`:

Add import at the top:

```typescript
import { createPublishArtifactTool } from "@/lib/runner/tools/sandbox/publish-artifact";
```

Reuse the helper from PR 52 instead of adding a second env check:

```typescript
import { isSandboxConfigured } from "@/lib/sandbox/env";
```

In the `createRunnerTools` function, add sandbox tools after the existing tool blocks (before the return statement for non-subagent):

```typescript
  // Sandbox tools (gated on SPRITES_TOKEN via shared env helper, excluded from subagents)
  const sandboxTools = !isSubagent && isSandboxConfigured()
    ? createPublishArtifactTool(supabase, clientId, threadId)
    : {};
```

And spread `...sandboxTools` in both the subagent and non-subagent return objects (it will be `{}` for subagents due to the guard above, but for clarity, only add it to the non-subagent return):

```typescript
  return {
    ...crmTools,
    ...storageTools,
    ...webTools,
    ...marketTools,
    ...listingTools,
    ...utilityTools,
    ...triggerTools,
    ...connectionTools,
    ...browserTools,
    ...sandboxTools,
  };
```

### Step 4: Run test -- expect PASS

```bash
npx vitest run src/lib/runner/__tests__/tool-registry.test.ts --reporter=verbose
```

Expected: ALL PASS (existing tests + 3 new)

### Step 5: Commit

```bash
git add src/lib/runner/tool-registry.ts src/lib/runner/__tests__/tool-registry.test.ts
git commit -m "feat(pr53): register publish_artifact in runner tool registry

Gated on SPRITES_TOKEN env var. Excluded from subagents. Follows
existing factory pattern. Three new tests for registration, env gating,
and subagent exclusion."
```

---

## Task 6: Add system prompt guidance for `publish_artifact`

No unit test for this task -- system prompt content is integration-tested via the existing system prompt tests. This is a documentation/guidance addition.

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`

### Step 1: Add tool guidance

In `src/lib/ai/system-prompt.ts`, find the tool guidance section and add the following block (follow the existing pattern for other tools):

```typescript
`## publish_artifact
Use this tool to generate and publish a web page -- property showcases, pitch pages, neighborhood guides, or open house landing pages.

IMPORTANT workflow:
1. BEFORE calling this tool, gather all property data first using CRM, web search, and browser tools. Pass the assembled data to this tool via propertyData.
2. The tool returns a LIVE PREVIEW URL. Share it with the user and ask for feedback.
3. When the user requests changes, call this tool again with the updated task -- the same Sprite will wake up and iterate on the existing code.
4. Only set shipIt=true when the user explicitly says "ship it," "publish it," "finalize," or similar. This builds a static HTML version and returns a signed download URL (valid for 30 days).
5. Do NOT auto-create a frontend-design/SKILL.md from casual chat. Skill creation is explicit -- the user must say "set up my brand preferences" or use the Skills page.

Do NOT use this for simple text responses or data analysis -- use the chat for text and analyze_spreadsheet for Excel models.`
```

### Step 2: Run existing system prompt tests to verify no regressions

```bash
npx vitest run src/lib/ai/__tests__/ --reporter=verbose
```

Expected: ALL PASS

### Step 3: Commit

```bash
git add src/lib/ai/system-prompt.ts
git commit -m "feat(pr53): add publish_artifact guidance to system prompt

Workflow: gather data first, share preview URL, iterate on follow-ups,
ship-it only on explicit request. Warns against auto-creating skill
files from casual chat. Notes 30-day signed URL expiry."
```

---

## Task 7: Full integration smoke test (manual)

No automated tests -- this is a manual E2E verification against a real Sprites environment.

**Step 1: Verify env vars**

```bash
echo $SPRITES_TOKEN
echo $ANTHROPIC_API_KEY
```

Both must be set.

**Step 2: Test first run via chat UI**

1. Start dev server: `pnpm dev`
2. Type: "Make a showcase page for a 3BR condo at 42 Noriega St, $1.8M, near Botanic Gardens MRT"
3. Verify:
   - [ ] Agent chains tools first (CRM search, web search) before calling `publish_artifact`
   - [ ] Chat shows "Building your showcase page..." or similar
   - [ ] After 20-60s, chat shows a live preview URL (read from `sprite.url`)
   - [ ] URL opens a live web page with property details
   - [ ] Page has proper styling (not generic/broken)
   - [ ] Page includes property details from CRM/search data
   - [ ] Dev server created as a Service (check logs for `createService`)

**Step 3: Test multi-turn iteration (same Sprite)**

1. Say: "Swap the hero to photo 3 and add a mortgage calculator"
2. Verify:
   - [ ] Same Sprite wakes (no new Sprite created -- check logs)
   - [ ] Same preview URL, page updates with changes
   - [ ] Changes applied correctly (hero swapped, calculator added)
   - [ ] Dev server service still running (not recreated -- check logs for `listServices`)
3. Say: "Make the cards bigger with more whitespace"
4. Verify:
   - [ ] Same Sprite, same URL, CSS changes applied

**Step 4: Test ship-it (static HTML publishing)**

1. Say: "Looks good, ship it"
2. Verify:
   - [ ] Agent calls `publish_artifact` with `shipIt=true`
   - [ ] Static HTML built (`build.sh` runs in Sprite)
   - [ ] HTML uploaded to Supabase Storage
   - [ ] Signed URL returned (30-day expiry -- agent should mention the time limit)
   - [ ] URL opens a self-contained HTML page (works offline if saved)

**Step 5: Test without user skill**

1. Verify: page uses clean/neutral default theme (no opinionated dark/gold)
2. Only after the user explicitly sets up brand preferences should the agent read a SKILL.md

**Step 6: Test with user skill**

1. In chat: "Set up my property showcase brand preferences. I want dark backgrounds with gold accents, luxury feel."
2. Verify: `frontend-design/SKILL.md` created in Supabase Storage (via the existing `write_file` tool)
3. Ask for another showcase page
4. Verify: page follows the dark + gold brand guidelines from SKILL.md

---

## Summary

| Task | What | Test Type | Key Files | Depends On |
|---|---|---|---|---|
| 1 | Pre-scaffolded React template (7 components, Vite 6 + TW4, neutral theme) | Manual build verify | `src/lib/sandbox/templates/property-showcase/` | -- |
| 2 | `buildArtifactPrompt()` -- prompt construction (3 modes) | Unit tests (12 tests) | `src/lib/sandbox/artifact-prompt.ts` | -- |
| 3 | `artifact-runner.ts` -- orchestration sub-functions | Unit tests (18+ tests) | `src/lib/sandbox/artifact-runner.ts` | PR 52 types |
| 4 | `createPublishArtifactTool()` -- AI SDK v6 tool factory | Unit tests (15+ tests) | `src/lib/runner/tools/sandbox/publish-artifact.ts` | 2, 3, PR 52 |
| 5 | Register in tool registry (env-gated, subagent-excluded) | Unit tests (3 tests) | `src/lib/runner/tool-registry.ts` | 4 |
| 6 | System prompt guidance | Regression tests | `src/lib/ai/system-prompt.ts` | 4 |
| 7 | E2E manual test (first run + iteration + ship-it + skills) | Manual | -- | All above + PR 52 |

Tasks 1-2 can start immediately (no dependencies). Task 3 needs PR 52 types. Tasks are sequential from 4 onward.

### Key SDK Corrections (from `sprites-sdk-verification.md`)

| Aspect | Wrong Pattern | Correct Pattern |
|---|---|---|
| **CLI invocation** | `sprite.exec('claude --dangerously-skip-permissions -p "long prompt"')` | `sprite.execFile('claude', ['--dangerously-skip-permissions', '-p', prompt], { env })` |
| **Dev server** | `sprite.createSession('npm run dev')` or telling Claude to start it | `sprite.createService('dev-server', { cmd: 'bash', args: ['-lc', 'cd /workspace/app && npm run dev'] })` managed by the runner |
| **Service cwd** | `sprite.createService('dev-server', { cmd: 'npm', args: ['run', 'dev'], cwd: '/workspace/app' })` | Use `bash -lc` wrapper -- rc37 `createService` may not support `cwd` |
| **Preview URL** | Hardcode `https://{id}.sprites.dev` | Read from `sprite.url` (domain drift between .app/.dev) |
| **URL auth** | Assume public by default | Call `sprite.updateURLSettings({ auth: 'public' })` -- private by default |
| **Sprite scope** | Per-thread | Per-thread via `findActiveSpriteSession()` + `getOrCreateSprite()` |
| **SDK version** | `@fly/sprites@0.0.1` (stable) | `@fly/sprites@0.0.1-rc37` (stable lacks filesystem/services/policy APIs) |
| **Node version** | Any | Node 24+ required (`engines.node >= 24.0.0`) |
| **API key** | Write to Sprite config / env file | Pass per-command via `execFile({ env: { ANTHROPIC_API_KEY } })` |
| **Publishing** | "Permanent URL" | Supabase Storage signed URL (30-day expiry). Be honest about it. |
| **Scaffold theme** | Hardcoded dark/gold | Visually neutral. User's SKILL.md controls the aesthetic. |
| **Skill creation** | Auto-create from casual chat | Explicit only (user says "set up brand preferences") |
| **Provisioning** | Pre-provisioning script | No script. Dependencies install on first use, persist across hibernation. |
