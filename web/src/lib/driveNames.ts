// Matching a name we hold against a folder that already exists in Drive.
//
// Creative Exports has been organised by hand for years, so its folders are
// spelled the way a person types them, not the way this app stores them:
// "Broker Brunch" for The Broker Brunch, "Dr. Tego" for Dr Tego. Creating a
// folder per client without checking would put a second "Dr Tego" next to
// "Dr. Tego" and split a client's deliveries across both.
//
// Deliberately forgiving about punctuation, case, spacing and a leading
// "The", and deliberately not forgiving about anything else: matching on a
// shared word would file Elle Sera's work under Elle Sera Ad.

export function normalizeFolderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'’"`]/g, "") // Dr. Tego -> dr tego
    .replace(/[_\-–—]+/g, " ") // hyphens and dashes read as spaces
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, ""); // The Broker Brunch -> broker brunch
}

// The folder to put this in, out of what's already there. Null means there
// isn't one yet and the caller should create it under the real name.
export function matchFolder<T extends { name: string }>(wanted: string, existing: T[]): T | null {
  const target = normalizeFolderName(wanted);
  if (!target) return null;
  return existing.find((f) => normalizeFolderName(f.name) === target) ?? null;
}
