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
    description: "Message your agent from your phone and receive approval prompts in chat.",
    icon: "send",
    toneClassName: "bg-info/10 text-info ring-info/20",
  },
  {
    name: "WhatsApp",
    description: "Keep client-facing work close to the channel advisors already use every day.",
    icon: "whatsapp",
    toneClassName: "bg-success/10 text-success ring-success/20",
  },
];

export default function ChannelsPage() {
  return (
    <PageCanvas contentClassName="max-w-4xl gap-7">
      <PageHeader
        title="Channels"
        description="Mobile approvals and client communication channels NeoBot will support next."
        descriptionClassName="max-w-2xl"
      />

      <div className="grid gap-4 md:grid-cols-2">
        {channelPreviews.map((channel) => (
          <PageSurface
            key={channel.name}
            className="flex min-h-44 flex-col justify-between gap-6"
            padding="lg"
          >
            <div className="flex items-start justify-between gap-4">
              <div
                className={`flex size-11 items-center justify-center rounded-full ring-1 ${channel.toneClassName}`}
              >
                <AppIcon name={channel.icon} className="size-5" />
              </div>
              <Badge variant="outline" className="rounded-full px-2.5 py-1 text-caption">
                Coming soon
              </Badge>
            </div>

            <div>
              <h2 className="type-toolbar-title">{channel.name}</h2>
              <p className="mt-2 text-meta text-muted-foreground">{channel.description}</p>
            </div>
          </PageSurface>
        ))}
      </div>
    </PageCanvas>
  );
}
