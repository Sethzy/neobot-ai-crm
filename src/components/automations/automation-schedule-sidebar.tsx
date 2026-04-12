/**
 * Right sidebar for automation detail page showing schedule config.
 * @module components/automations/automation-schedule-sidebar
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateTriggerSchedule } from "@/hooks/use-triggers";
import { buildCronExpression, type Recurrence } from "@/lib/triggers/cron-builder";
import { cronToHuman } from "@/lib/triggers/cron-display";
import { computeNextFireAt } from "@/lib/triggers/cron-utils";
import type { Database } from "@/types/database";

type TriggerRow = Database["public"]["Tables"]["agent_triggers"]["Row"];

interface AutomationScheduleSidebarProps {
  trigger: TriggerRow;
}

const DAY_LABELS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

/** Infers a recurrence preset from an existing cron expression. */
function inferRecurrence(cron: string | null): Recurrence {
  if (!cron) return "daily";
  if (cron.endsWith("* * 1-5")) return "weekdays";
  if (cron.startsWith("0 ") && cron.includes("1 * *")) return "monthly";
  if (/\d+ \d+ \* \* \d/.test(cron) && !cron.endsWith("*")) return "weekly";
  if (cron.match(/^\d+ \d+ \* \* \*$/)) return "daily";
  return "custom";
}

/** Extracts HH:mm from a cron expression (minutes and hours fields). */
function inferTime(cron: string | null): string {
  if (!cron) return "08:00";
  const parts = cron.split(" ");
  if (parts.length < 2) return "08:00";
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  if (isNaN(minute) || isNaN(hour)) return "08:00";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Extracts day-of-week numbers from the 5th cron field. */
function inferDays(cron: string | null): number[] {
  if (!cron) return [];
  const parts = cron.split(" ");
  if (parts.length < 5) return [];
  const dow = parts[4];
  if (dow === "*" || dow === "1-5") return [];
  return dow.split(",").map(Number).filter((n) => !isNaN(n));
}

export function AutomationScheduleSidebar({ trigger }: AutomationScheduleSidebarProps) {
  const updateSchedule = useUpdateTriggerSchedule();

  const [recurrence, setRecurrence] = useState<Recurrence>(() => inferRecurrence(trigger.cron_expression));
  const [time, setTime] = useState(() => inferTime(trigger.cron_expression));
  const [days, setDays] = useState<number[]>(() => inferDays(trigger.cron_expression));
  const [customCron, setCustomCron] = useState(trigger.cron_expression ?? "");

  // Sync state when trigger data changes externally
  useEffect(() => {
    setRecurrence(inferRecurrence(trigger.cron_expression));
    setTime(inferTime(trigger.cron_expression));
    setDays(inferDays(trigger.cron_expression));
    setCustomCron(trigger.cron_expression ?? "");
  }, [trigger.cron_expression]);

  const saveSchedule = useCallback((
    newRecurrence: Recurrence,
    newDays: number[],
    newTime: string,
    newCustomCron?: string,
  ) => {
    const cronExpression = buildCronExpression(newRecurrence, newDays, newTime, newCustomCron);
    try {
      const nextFireAt = computeNextFireAt(cronExpression, new Date());
      updateSchedule.mutate(
        {
          triggerId: trigger.id,
          cronExpression,
          payload: (trigger.payload as Record<string, unknown>) ?? {},
          nextFireAt: nextFireAt.toISOString(),
        },
        {
          onError: (err) => toast.error(`Failed to update schedule: ${err.message}`),
        },
      );
    } catch {
      toast.error("Invalid cron expression");
    }
  }, [trigger.id, trigger.payload, updateSchedule]);

  const toggleDay = (day: number) => {
    const newDays = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
    setDays(newDays);
    saveSchedule(recurrence, newDays, time);
  };

  if (trigger.trigger_type === "webhook") {
    return (
      <div className="space-y-4 rounded-xl border border-border/40 bg-card p-4 shadow-sm">
        <SidebarSection label="Type">
          <p className="text-sm text-foreground">Webhook</p>
        </SidebarSection>
        <SidebarSection label="Invocation Message">
          <p className="text-sm text-muted-foreground">{trigger.invocation_message || "\u2014"}</p>
        </SidebarSection>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/40 bg-card p-4 shadow-sm">
      <SidebarSection label="Schedule">
        <Select
          value={recurrence}
          onValueChange={(val: Recurrence) => {
            setRecurrence(val);
            saveSchedule(val, days, time);
          }}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekdays">Weekdays</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </SidebarSection>

      {recurrence === "weekly" && (
        <SidebarSection label="Days">
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleDay(value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  days.includes(value)
                    ? "bg-foreground text-background"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </SidebarSection>
      )}

      {recurrence !== "custom" && (
        <SidebarSection label="Time">
          <Input
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              saveSchedule(recurrence, days, e.target.value);
            }}
            className="h-8 text-sm"
          />
        </SidebarSection>
      )}

      {recurrence === "custom" && (
        <SidebarSection label="Cron Expression">
          <Input
            value={customCron}
            onChange={(e) => setCustomCron(e.target.value)}
            onBlur={() => saveSchedule("custom", [], time, customCron)}
            placeholder="0 8 * * 1-5"
            className="h-8 font-mono text-sm"
          />
        </SidebarSection>
      )}

      <SidebarSection label="Summary">
        <p className="text-sm text-muted-foreground">
          {cronToHuman(trigger.cron_expression)}
        </p>
      </SidebarSection>

      {trigger.invocation_message ? (
        <SidebarSection label="Invocation Message">
          <p className="text-sm text-muted-foreground line-clamp-3">
            {trigger.invocation_message}
          </p>
        </SidebarSection>
      ) : null}
    </div>
  );
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
