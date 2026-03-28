# Autopilot Settings Card + Per-Client Timezone Implementation Plan

**PR:** Out-of-plan (supplements PR 19: Autopilot thread + pulse)
**Decisions:** TRIG-07, TRIG-09
**Goal:** Let users configure autopilot pulse interval, quiet hours, and enabled state from the Settings page. Auto-detect browser timezone so quiet hours work correctly for users outside Asia/Singapore.

**Architecture:** Add a `timezone` column to `autopilot_config`. The scanner passes the stored timezone to `isInQuietHours()` instead of hardcoding `Asia/Singapore`. The settings UI auto-detects the browser timezone as the initial default, but also exposes a timezone `<Select>` dropdown (~30 common IANA timezones) so users can override it. The existing DB trigger `sync_autopilot_trigger_from_config` already propagates interval/enabled changes to the `agent_triggers` row, so the API route only needs to update `autopilot_config`.

**Tech Stack:** Supabase migration, Next.js API route, React client component, Vitest

---

## Relevant Files

**Create:**
- `app/api/settings/autopilot/route.ts` — GET + PATCH API route
- `app/(dashboard)/settings/autopilot-card.tsx` — client component for autopilot settings
- `src/lib/autopilot/__tests__/autopilot-settings.test.ts` — API route unit tests (optional, route is thin)

**Modify:**
- `supabase/migrations/` — new migration for `timezone` column
- `src/types/database.ts` — add `timezone` to `autopilot_config` types
- `src/lib/autopilot/constants.ts` — add `timezone` to Zod schema
- `src/lib/triggers/scanner.ts` — `fetchAutopilotConfig` returns timezone, passes it to `isInQuietHours()`
- `app/(dashboard)/settings/page.tsx` — load autopilot config, render `AutopilotCard`

---

## Task 1: DB Migration — add `timezone` column

**Files:**
- Create: `supabase/migrations/20260326120000_add_timezone_to_autopilot_config.sql`

**Step 1: Write the migration**

Create `supabase/migrations/20260326120000_add_timezone_to_autopilot_config.sql`:

```sql
-- Add per-client timezone to autopilot_config.
-- Nullable — NULL falls back to Asia/Singapore in application code.

ALTER TABLE public.autopilot_config
  ADD COLUMN timezone TEXT;

COMMENT ON COLUMN public.autopilot_config.timezone IS
  'IANA timezone for quiet-hours evaluation. Auto-detected from browser. NULL = Asia/Singapore.';
```

**Step 2: Apply the migration**

Run: `npx supabase migration up` (or apply via MCP tool)

**Step 3: Commit**

```bash
git add supabase/migrations/20260326120000_add_timezone_to_autopilot_config.sql
git commit -m "feat: add timezone column to autopilot_config"
```

---

## Task 2: Update TypeScript types + Zod schema

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/lib/autopilot/constants.ts`

**Step 1: Update database types**

In `src/types/database.ts`, add `timezone: string | null` to the `autopilot_config` Row, Insert, and Update types:

```typescript
// Row — add after updated_at:
timezone: string | null

// Insert — add after updated_at:
timezone?: string | null

// Update — add after updated_at:
timezone?: string | null
```

**Step 2: Update Zod schema**

In `src/lib/autopilot/constants.ts`, add `timezone` to `autopilotConfigSchema`:

```typescript
export const autopilotConfigSchema = z.object({
  config_id: z.string().uuid(),
  client_id: z.string().uuid(),
  pulse_interval: z.enum(pulseIntervalValues),
  quiet_hours_start: quietHoursTimeSchema.nullable(),
  quiet_hours_end: quietHoursTimeSchema.nullable(),
  timezone: z.string().nullable(),
  enabled: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
```

**Step 3: Commit**

```bash
git add src/types/database.ts src/lib/autopilot/constants.ts
git commit -m "feat: add timezone to autopilot_config types and schema"
```

---

## Task 3: Wire timezone through scanner

**Files:**
- Modify: `src/lib/triggers/scanner.ts`

**Step 1: Update `fetchAutopilotConfig` return type and select**

In `src/lib/triggers/scanner.ts`, update the `fetchAutopilotConfig` function to also select and return `timezone`:

```typescript
async function fetchAutopilotConfig(
  supabase: TriggerSupabaseClient,
  clientId: string,
): Promise<{
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string | null;
} | null> {
  const { data, error } = await supabase
    .from("autopilot_config")
    .select("quiet_hours_start, quiet_hours_end, timezone")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load autopilot config: ${error.message}`);
  }

  return data;
}
```

**Step 2: Pass timezone to `isInQuietHours`**

Find the `isInQuietHours` call site (around line 257) and pass the timezone:

```typescript
if (
  autopilotConfig &&
  isInQuietHours({
    quietHoursStart: autopilotConfig.quiet_hours_start,
    quietHoursEnd: autopilotConfig.quiet_hours_end,
    now,
    timezone: autopilotConfig.timezone ?? undefined,
  })
)
```

When `timezone` is `null` (not yet detected), `isInQuietHours` falls back to its existing `Asia/Singapore` default.

**Step 3: Run existing tests**

Run: `npx vitest run src/lib/autopilot/__tests__/quiet-hours.test.ts`
Expected: PASS (no behavior change — we're just wiring an optional parameter)

**Step 4: Commit**

```bash
git add src/lib/triggers/scanner.ts
git commit -m "feat: pass per-client timezone to isInQuietHours in scanner"
```

---

## Task 4: API route for autopilot config

**Files:**
- Create: `app/api/settings/autopilot/route.ts`

**Step 1: Create the API route**

Create `app/api/settings/autopilot/route.ts`:

```typescript
/**
 * GET + PATCH autopilot configuration for the current client.
 * @module app/api/settings/autopilot/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { pulseIntervalValues } from "@/lib/autopilot/constants";
import { resolveClientId } from "@/lib/chat/client-id";
import { createClient } from "@/lib/supabase/server";

const patchBodySchema = z.object({
  pulse_interval: z.enum(pulseIntervalValues).optional(),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  enabled: z.boolean().optional(),
  timezone: z.string().optional(),
}).refine(
  (data) => {
    // If either quiet hours field is provided, both must be provided
    const hasStart = data.quiet_hours_start !== undefined;
    const hasEnd = data.quiet_hours_end !== undefined;
    if (hasStart !== hasEnd) return false;
    // If both provided, both must be null or both non-null
    if (hasStart && hasEnd) {
      const startNull = data.quiet_hours_start === null;
      const endNull = data.quiet_hours_end === null;
      if (startNull !== endNull) return false;
    }
    return true;
  },
  { message: "quiet_hours_start and quiet_hours_end must be set or cleared together" },
);

export async function GET(): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  try {
    const clientId = await resolveClientId(supabase, userId);
    const readClient = await createClient();
    const { data, error } = await readClient
      .from("autopilot_config")
      .select("config_id, pulse_interval, quiet_hours_start, quiet_hours_end, timezone, enabled")
      .eq("client_id", clientId)
      .single();

    if (error) return jsonError("Failed to load autopilot config.", 500);
    return Response.json(data);
  } catch {
    return jsonError("Failed to load autopilot config.", 500);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  let body: z.infer<typeof patchBodySchema>;
  try {
    body = patchBodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  try {
    const clientId = await resolveClientId(supabase, userId);

    // RLS allows UPDATE on own row — use regular client
    const { data, error } = await supabase
      .from("autopilot_config")
      .update(body)
      .eq("client_id", clientId)
      .select("config_id, pulse_interval, quiet_hours_start, quiet_hours_end, timezone, enabled")
      .single();

    if (error) return jsonError("Failed to update autopilot config.", 500);
    return Response.json(data);
  } catch {
    return jsonError("Failed to update autopilot config.", 500);
  }
}
```

**Step 2: Commit**

```bash
git add app/api/settings/autopilot/route.ts
git commit -m "feat: add GET + PATCH API route for autopilot settings"
```

---

## Task 5: Autopilot settings card component

**Files:**
- Create: `app/(dashboard)/settings/autopilot-card.tsx`

**Step 1: Create the AutopilotCard component**

Create `app/(dashboard)/settings/autopilot-card.tsx`:

```typescript
/**
 * Autopilot settings card — pulse interval, quiet hours, enabled toggle.
 * @module app/(dashboard)/settings/autopilot-card
 */
"use client";

import { useCallback, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface AutopilotConfig {
  config_id: string;
  pulse_interval: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string | null;
  enabled: boolean;
}

interface AutopilotCardProps {
  initialConfig: AutopilotConfig;
}

const INTERVAL_LABELS: Record<string, string> = {
  "1h": "Every hour",
  "2h": "Every 2 hours",
  "6h": "Every 6 hours",
  "12h": "Every 12 hours",
};

export function AutopilotCard({ initialConfig }: AutopilotCardProps) {
  const [config, setConfig] = useState(initialConfig);
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(async (patch: Partial<AutopilotConfig>) => {
    setIsSaving(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch("/api/settings/autopilot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, timezone }),
      });
      if (res.ok) {
        const updated = await res.json() as AutopilotConfig;
        setConfig(updated);
      }
    } finally {
      setIsSaving(false);
    }
  }, []);

  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <CardDescription>Agent</CardDescription>
            <CardTitle className="text-2xl">Autopilot</CardTitle>
          </div>
          <Switch
            checked={config.enabled}
            disabled={isSaving}
            onCheckedChange={(enabled) => void save({ enabled })}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Your agent thinks on its own periodically — checking CRM, following up on tasks, and
          keeping memory up to date.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <Label htmlFor="pulse-interval" className="min-w-fit text-sm text-muted-foreground">
            Pulse every
          </Label>
          <Select
            value={config.pulse_interval}
            disabled={isSaving}
            onValueChange={(value) => void save({ pulse_interval: value })}
          >
            <SelectTrigger id="pulse-interval" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(INTERVAL_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">
            Quiet hours
          </Label>
          <p className="text-xs text-muted-foreground/70">
            Pause autopilot during these hours. Uses your browser timezone
            ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
          </p>
          <div className="flex items-center gap-3">
            <input
              type="time"
              value={config.quiet_hours_start ?? ""}
              disabled={isSaving}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              onChange={(e) => {
                const start = e.target.value || null;
                void save({
                  quiet_hours_start: start,
                  quiet_hours_end: start ? (config.quiet_hours_end ?? "07:00") : null,
                });
              }}
            />
            <span className="text-sm text-muted-foreground">to</span>
            <input
              type="time"
              value={config.quiet_hours_end ?? ""}
              disabled={isSaving}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              onChange={(e) => {
                const end = e.target.value || null;
                void save({
                  quiet_hours_start: end ? (config.quiet_hours_start ?? "22:00") : null,
                  quiet_hours_end: end,
                });
              }}
            />
            {config.quiet_hours_start && (
              <button
                type="button"
                disabled={isSaving}
                className="text-xs text-muted-foreground underline hover:text-foreground"
                onClick={() => void save({ quiet_hours_start: null, quiet_hours_end: null })}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add app/(dashboard)/settings/autopilot-card.tsx
git commit -m "feat: add AutopilotCard settings component"
```

---

## Task 6: Wire into settings page

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

**Step 1: Add data loader**

Add a `loadAutopilotConfig` function to the settings page (same pattern as `loadCrmConfigModeExpiresAt`):

```typescript
import { AutopilotCard } from "./autopilot-card";

// ... existing imports ...

interface AutopilotConfigData {
  config_id: string;
  pulse_interval: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string | null;
  enabled: boolean;
}

async function loadAutopilotConfig(): Promise<AutopilotConfigData | null> {
  try {
    const supabase = await createClient();
    const clientId = await resolveClientId(supabase);
    const { data } = await supabase
      .from("autopilot_config")
      .select("config_id, pulse_interval, quiet_hours_start, quiet_hours_end, timezone, enabled")
      .eq("client_id", clientId)
      .single();

    return data;
  } catch {
    return null;
  }
}
```

**Step 2: Add to Promise.all and render**

Update the `SettingsPage` component:

```typescript
const [client, messageQuota, crmConfigExpiresAt, telegramChatId, autopilotConfig] = await Promise.all([
  loadCurrentBillingState(),
  loadCurrentMessageQuota(),
  loadCrmConfigModeExpiresAt(),
  loadTelegramChatId(),
  loadAutopilotConfig(),
]);
```

Add the card to the JSX, after the Telegram card in the right column:

```tsx
<div className="space-y-4">
  <CrmConfigModeCard initialExpiresAt={crmConfigExpiresAt} />
  <TelegramConnectCard initialChatId={telegramChatId} />
  {autopilotConfig ? <AutopilotCard initialConfig={autopilotConfig} /> : null}
</div>
```

**Step 3: Commit**

```bash
git add app/(dashboard)/settings/page.tsx
git commit -m "feat: wire AutopilotCard into settings page"
```

---

## Task 7: Verify end-to-end

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Manual verification**

1. Navigate to `/settings`
2. Verify the Autopilot card renders with current config (6h default, no quiet hours, enabled)
3. Change pulse interval → verify it saves (check `autopilot_config` row + `agent_triggers` cron expression updates via DB trigger)
4. Set quiet hours (e.g., 22:00 to 07:00) → verify timezone column is populated with browser timezone
5. Toggle enabled off/on → verify trigger enabled state syncs
6. Clear quiet hours → verify both fields go null

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: autopilot settings card with per-client timezone

Adds timezone column to autopilot_config, wires it through the scanner
so quiet hours evaluate in the user's timezone instead of hardcoded
Asia/Singapore. Settings UI exposes pulse interval, quiet hours, and
enabled toggle. Browser timezone auto-detected on every save."
```
