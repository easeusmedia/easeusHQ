// What a dropdown actually lists, for one that can grow without end (a
// client's projects). Pure, so the rules can be tested on their own:
//
//   - pinned entries ("＋ New project") always come first, never filtered
//   - with no search typed, only the first `recent` of the rest — the caller
//     orders them newest first — plus the current pick if it's older
//   - with something typed, every entry whose label contains it
//   - "Show more" reveals `more` further entries beyond the recent few
//   - `older` is how many still aren't shown — whether "Show more" appears
export type PickOption = { value: string; label: string; pinned?: boolean };

export function pickList(
  options: PickOption[],
  value: string,
  // always: the search box shows however short the list (a list you can
  // also add to needs somewhere to type the new one)
  search: { recent: number; always?: boolean } | undefined,
  query: string,
  more = 0
): { shown: PickOption[]; matches: PickOption[]; searching: boolean; older: number } {
  const pinned = options.filter((o) => o.pinned);
  const rest = options.filter((o) => !o.pinned);
  // a short list is just the list; the search only earns its place when
  // there's more than the recent few
  const searching = !!search && (!!search.always || rest.length > search.recent);
  if (!searching) return { shown: [...pinned, ...rest], matches: rest, searching, older: 0 };

  const q = query.trim().toLowerCase();
  if (q) {
    const matches = rest.filter((o) => o.label.toLowerCase().includes(q));
    return { shown: [...pinned, ...matches], matches, searching, older: 0 };
  }

  const recent = rest.slice(0, search.recent + more);
  const current = rest.find((o) => o.value === value);
  const matches = current && !recent.includes(current) ? [...recent, current] : recent;
  return { shown: [...pinned, ...matches], matches, searching, older: rest.length - matches.length };
}
