// What a dropdown actually lists, for one that can grow without end (a
// client's projects). Pure, so the rules can be tested on their own:
//
//   - pinned entries ("＋ New project") always come first, never filtered
//   - with no search typed, only the first `recent` of the rest — the caller
//     orders them newest first — plus the current pick if it's older
//   - with something typed, every entry whose label contains it
//   - `older` is how many aren't shown, for "12 older — type to find them"
export type PickOption = { value: string; label: string; pinned?: boolean };

export function pickList(
  options: PickOption[],
  value: string,
  search: { recent: number } | undefined,
  query: string
): { shown: PickOption[]; matches: PickOption[]; searching: boolean; older: number } {
  const pinned = options.filter((o) => o.pinned);
  const rest = options.filter((o) => !o.pinned);
  // a short list is just the list; the search only earns its place when
  // there's more than the recent few
  const searching = !!search && rest.length > search.recent;
  if (!searching) return { shown: [...pinned, ...rest], matches: rest, searching, older: 0 };

  const q = query.trim().toLowerCase();
  if (q) {
    const matches = rest.filter((o) => o.label.toLowerCase().includes(q));
    return { shown: [...pinned, ...matches], matches, searching, older: 0 };
  }

  const recent = rest.slice(0, search.recent);
  const current = rest.find((o) => o.value === value);
  const matches = current && !recent.includes(current) ? [...recent, current] : recent;
  return { shown: [...pinned, ...matches], matches, searching, older: rest.length - matches.length };
}
