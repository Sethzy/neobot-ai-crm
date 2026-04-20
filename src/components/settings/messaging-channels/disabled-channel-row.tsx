/**
 * Row variant for channels that are on the roadmap but not yet connectable.
 * Renders the shared ChannelRow primitive with a disabled "Coming soon" button.
 * @module components/settings/messaging-channels/disabled-channel-row
 */
"use client";

import type { AppIconName } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";

import { ChannelRow } from "./channel-row";

interface DisabledChannelRowProps {
  icon: AppIconName;
  iconTint?: "blue" | "green" | "purple" | "neutral";
  title: string;
  description: string;
}

export function DisabledChannelRow({
  icon,
  iconTint,
  title,
  description,
}: DisabledChannelRowProps) {
  return (
    <ChannelRow
      icon={icon}
      iconTint={iconTint}
      title={title}
      description={description}
      action={
        <Button variant="outline" size="sm" disabled>
          Coming soon
        </Button>
      }
    />
  );
}
