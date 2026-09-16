// Reading view-state (which tab, how many projects) out of the URL.
//
// The server passes the param in as a prop, which is what the first paint
// uses. But on a Back navigation Next replays the RSC payload it cached when
// the page was *first* fetched — and that fetch happened before
// history.replaceState put ?tab / ?show in the URL, so the prop is stale on
// exactly the journey this is meant to fix. The address bar is restored
// correctly by the browser either way, so once we're on the client, trust it
// over the prop.
//
// No hydration risk: on a genuine first load the server rendered from the
// same query string this reads, so the two agree.
export function paramOrProp(name: string, prop?: string): string | undefined {
  if (typeof window === "undefined") return prop;
  return new URLSearchParams(window.location.search).get(name) ?? undefined;
}

// replaceState, not router.push: switching a tab or widening a list isn't a
// step you should have to press Back through, but the URL still has to be
// current at the moment you navigate away so Back can restore it.
export function setParam(name: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  window.history.replaceState(null, "", url);
}
