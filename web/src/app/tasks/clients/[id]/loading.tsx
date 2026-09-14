// The one that mattered most to add: this page force-fetches fresh data
// on every load (invoices, tasks, projects…), and with no loading state at
// all here, clicking a different client in the switcher just sat on the
// *previous* client's page for a second or two with zero feedback — easy
// to mistake for navigation being broken rather than merely loading. The
// switcher itself lives one level up (see ClientSwitcherSlot), so it stays
// visible and already-highlighting the newly clicked client while this
// spinner covers only the content next to it.
export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center py-24">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
    </div>
  );
}
