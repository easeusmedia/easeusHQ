// Same reasoning as the workspace loading.tsx: without this, clicking into the
// Clients list shows nothing at all until the full response arrives — a
// force-dynamic page with no feedback that the click even registered.
export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center py-24">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
    </div>
  );
}
