// A new task that hasn't been added yet, kept in this browser: a stray
// close, a refresh or a closed tab doesn't lose what was written. Only
// this browser ever has it, and it may not be there at all (a private
// window, cleared site data), so every read and write is allowed to fail.

export function readDraft<T>(key: string): Partial<T> | null {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as Partial<T>) : null;
  } catch {
    return null;
  }
}

// null, or nothing written yet: there's no draft to keep
export function keepDraft(key: string, value: object | null) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    // no storage here: the draft lives only while the page is open
  }
}
