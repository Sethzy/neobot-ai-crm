/**
 * Autopilot settings card — pulse interval, quiet hours, timezone, enabled toggle.
 * @module components/settings/autopilot-card
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

export interface AutopilotConfigData {
  config_id: string;
  pulse_interval: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string | null;
  enabled: boolean;
}

interface AutopilotCardProps {
  initialConfig: AutopilotConfigData;
}

const INTERVAL_LABELS: Record<string, string> = {
  "1h": "Every hour",
  "2h": "Every 2 hours",
  "6h": "Every 6 hours",
  "12h": "Every 12 hours",
};

/** Common IANA timezones grouped by region. */
const TIMEZONE_OPTIONS = [
  { value: "Pacific/Honolulu", label: "Hawaii (HST)" },
  { value: "America/Anchorage", label: "Alaska (AKST)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST)" },
  { value: "America/Denver", label: "Denver (MST)" },
  { value: "America/Chicago", label: "Chicago (CST)" },
  { value: "America/New_York", label: "New York (EST)" },
  { value: "America/Sao_Paulo", label: "São Paulo (BRT)" },
  { value: "Atlantic/Reykjavik", label: "Reykjavik (GMT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Europe/Berlin", label: "Berlin (CET)" },
  { value: "Europe/Moscow", label: "Moscow (MSK)" },
  { value: "Africa/Cairo", label: "Cairo (EET)" },
  { value: "Africa/Johannesburg", label: "Johannesburg (SAST)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Kolkata", label: "Kolkata (IST)" },
  { value: "Asia/Bangkok", label: "Bangkok (ICT)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (HKT)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Seoul", label: "Seoul (KST)" },
  { value: "Australia/Perth", label: "Perth (AWST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
  { value: "Pacific/Auckland", label: "Auckland (NZST)" },
] as const;

const DEFAULT_TIMEZONE = "Asia/Singapore";

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function resolveTimezone(stored: string | null): string {
  if (stored) return stored;
  const browser = getBrowserTimezone();
  // If browser timezone is in our list, use it; otherwise fall back to default
  if (TIMEZONE_OPTIONS.some((tz) => tz.value === browser)) return browser;
  return DEFAULT_TIMEZONE;
}

export function AutopilotCard({ initialConfig }: AutopilotCardProps) {
  const [config, setConfig] = useState(initialConfig);
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(async (patch: Record<string, unknown>) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings/autopilot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = (await res.json()) as AutopilotConfigData;
        setConfig(updated);
      }
    } finally {
      setIsSaving(false);
    }
  }, []);

  const effectiveTimezone = resolveTimezone(config.timezone);

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
        {/* Pulse interval */}
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

        {/* Timezone */}
        <div className="flex items-center gap-4">
          <Label htmlFor="timezone" className="min-w-fit text-sm text-muted-foreground">
            Timezone
          </Label>
          <Select
            value={effectiveTimezone}
            disabled={isSaving}
            onValueChange={(value) => void save({ timezone: value })}
          >
            <SelectTrigger id="timezone" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Quiet hours */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Quiet hours</Label>
          <p className="text-xs text-muted-foreground/70">
            Pause autopilot pulses during these hours.
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
