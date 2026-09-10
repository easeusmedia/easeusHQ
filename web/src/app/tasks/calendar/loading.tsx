// Shown INSTANTLY on click while this segment's Server Component data is
// still loading — without this, a force-dynamic page shows nothing at all
// until the full response arrives, which reads as a stall even once that
// response is fast, since there's zero feedback that the click registered.
export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center py-24">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
    </div>
  );
}
