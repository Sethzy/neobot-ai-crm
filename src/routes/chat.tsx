/**
 * Chat (Home) route — the default landing page for authenticated users.
 * This is the primary workspace per the UX spec §5.1.
 */
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/app-layout";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});

function ChatPage() {
  return (
    <AppLayout>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Chat</h1>
          <p className="mt-2 text-muted-foreground">Coming soon</p>
        </div>
      </div>
    </AppLayout>
  );
}
