import { AppLayout } from "@/components/layout/app-layout";
import { DataStreamProvider } from "@/components/chat/data-stream-provider";
import { ThreadProvider } from "@/contexts/thread-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThreadProvider>
      <DataStreamProvider>
        <AppLayout>{children}</AppLayout>
      </DataStreamProvider>
    </ThreadProvider>
  );
}
