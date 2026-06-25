/**
 * Channels roadmap page.
 * Shows upcoming messaging channels without exposing unfinished connection flows.
 * @module app/(dashboard)/channels/page
 */
import { AppIcon, type AppIconName } from "@/components/icons/app-icons";
import { PageCanvas, PageSurface } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";

interface ChannelPreview {
  description: string;
  icon: AppIconName;
  name: string;
  toneClassName: string;
}

const channelPreviews: ChannelPreview[] = [
  {
    name: "Telegram",
    description: "Message your agent from your phone and handle approval prompts without opening the desktop app.",
    icon: "send",
    toneClassName: "bg-info/10 text-info ring-info/20",
  },
  {
    name: "WhatsApp",
    description: "Keep client-facing follow-ups close to the channel advisors already use every day.",
    icon: "whatsapp",
    toneClassName: "bg-success/10 text-success ring-success/20",
  },
];

export default function ChannelsPage() {
  return (
    <PageCanvas contentClassName="max-w-4xl gap-6">
      <PageHeader
        title="Channels"
        description="Mobile approvals and client communication channels NeoBot will support next."
        descriptionClassName="max-w-2xl"
      />

      <div className="grid gap-4 md:grid-cols-2">
        {channelPreviews.map((channel) => (
          <PageSurface
            key={channel.name}
            className="flex min-h-36 flex-col gap-5"
            padding="md"
          >
            <div className="flex items-start justify-between gap-4">
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-full ring-1 ${channel.toneClassName}`}
              >
                <AppIcon name={channel.icon} className="size-4.5" />
              </div>
              <Badge variant="outline" className="h-6 rounded-full px-2.5 type-row-meta">
                Coming soon
              </Badge>
            </div>

            <div className="max-w-[32rem]">
              <h2 className="type-section-title">{channel.name}</h2>
              <p className="mt-1.5 type-control-muted leading-relaxed">
                {channel.description}
              </p>
            </div>
          </PageSurface>
        ))}
      </div>
    </PageCanvas>
  );
}
