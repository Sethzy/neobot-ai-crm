import { AppLayout } from "@/components/layout/app-layout";
import { ThreadProvider } from "@/contexts/thread-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThreadProvider>
      <AppLayout>{children}</AppLayout>
    </ThreadProvider>
  );
}
