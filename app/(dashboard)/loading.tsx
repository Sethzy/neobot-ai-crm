/** Shared loading fallback for all dashboard routes. */
export default function DashboardLoading() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
    </div>
  );
}
