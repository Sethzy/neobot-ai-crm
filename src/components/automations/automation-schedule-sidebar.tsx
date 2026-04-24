/**
 * Right sidebar for automation detail page showing schedule config.
 * @module components/automations/automation-schedule-sidebar
 */
"use client";

import { useCallback, useState } from "react";
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
import {
  buildCronExpression,
  inferRecurrence,
  type Recurrence,
} from "@/lib/triggers/cron-builder";
import { computeNextFireAt } from "@/lib/triggers/cron-utils";
import type { Database } from "@/types/database";

type TriggerRow = Database["public"]["Tables"]["agent_triggers"]["Row"];

interface AutomationScheduleSidebarProps {
  trigger: TriggerRow;
}

const DAY_LABELS = [
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
  { value: 0, label: "S" },
];

/** Extracts HH:mm from a cron expression (minutes and hours fields). */
function inferTime(cron: string | null): string {
  if (!cron) return "08:00";
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 2) return "08:00";
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  if (isNaN(minute) || isNaN(hour)) return "08:00";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Extracts day-of-week numbers from the 5th cron field. */
function inferDays(cron: string | null): number[] {
  if (!cron) return [];
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return [];
  const dow = parts[4];
  if (dow === "*" || dow === "1-5" || dow === "0-6") return [];
  return dow.split(",").map(Number).filter((n) => !isNaN(n));
}

export function AutomationScheduleSidebar({ trigger }: AutomationScheduleSidebarProps) {
  return (
    <AutomationScheduleSidebarContent
      key={`${trigger.id}:${trigger.cron_expression ?? ""}`}
      trigger={trigger}
    />
  );
}

function AutomationScheduleSidebarContent({ trigger }: AutomationScheduleSidebarProps) {
  const updateSchedule = useUpdateTriggerSchedule();

  const [recurrence, setRecurrence] = useState<Recurrence>(() => inferRecurrence(trigger.cron_expression));
  const [time, setTime] = useState(() => inferTime(trigger.cron_expression));
  const [days, setDays] = useState<number[]>(() => inferDays(trigger.cron_expression));
  const [customCron, setCustomCron] = useState(trigger.cron_expression ?? "");

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
      <div className="space-y-6">
        <SidebarSection label="Type">
          <p className="type-control text-foreground">Webhook</p>
        </SidebarSection>
        {trigger.invocation_message ? (
          <SidebarSection label="Invocation message">
            <p className="type-control-muted text-muted-foreground">{trigger.invocation_message}</p>
          </SidebarSection>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SidebarSection label="Recurrence">
        <Select
          value={recurrence}
          onValueChange={(val: Recurrence) => {
            setRecurrence(val);
            saveSchedule(val, days, time);
          }}
        >
          <SelectTrigger className="h-9 type-control">
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
          <div className="flex items-center gap-1">
            {DAY_LABELS.map(({ value, label }, index) => {
              const isSelected = days.includes(value);
              return (
                <button
                  key={`${value}-${index}`}
                  type="button"
                  onClick={() => toggleDay(value)}
                  aria-pressed={isSelected}
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-caption transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              );
            })}
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
            className="h-9 type-control"
          />
        </SidebarSection>
      )}

      {recurrence === "custom" && (
        <SidebarSection label="Cron expression">
          <Input
            value={customCron}
            onChange={(e) => setCustomCron(e.target.value)}
            onBlur={() => saveSchedule("custom", [], time, customCron)}
            placeholder="0 8 * * 1-5"
            className="h-9 font-mono text-control"
          />
          <p className="type-control-muted text-muted-foreground">
            5-field cron format: min hr dom mon dow
          </p>
        </SidebarSection>
      )}

      {trigger.invocation_message ? (
        <SidebarSection label="Invocation message">
          <p className="type-control-muted line-clamp-3 text-muted-foreground">
            {trigger.invocation_message}
          </p>
        </SidebarSection>
      ) : null}
    </div>
  );
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="type-control text-foreground/80">{label}</Label>
      {children}
    </div>
  );
}
