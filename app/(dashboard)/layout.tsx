import { cookies } from "next/headers";
import { AppLayout } from "@/components/layout/app-layout";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get("sidebar_state")?.value === "true";

  return <AppLayout defaultSidebarOpen={sidebarOpen}>{children}</AppLayout>;
}
