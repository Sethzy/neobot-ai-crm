import { AppLayout } from "@/components/layout/app-layout";
import { DataStreamProvider } from "@/components/chat/data-stream-provider";
import { ClockProvider } from "@/components/chat/spinner/clock-context";
import { ThreadProvider } from "@/contexts/thread-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThreadProvider>
      <DataStreamProvider>
        <ClockProvider>
          <AppLayout>{children}</AppLayout>
        </ClockProvider>
      </DataStreamProvider>
    </ThreadProvider>
  );
}
