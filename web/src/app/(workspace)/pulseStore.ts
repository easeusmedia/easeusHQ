// What the last pulse said (see api/pulse and Pulse.tsx), for the parts of
// the page that act on it — the delivery chime, client messages.
export type PulseData = {
  v: string;
  // who's online, by name (the avatars' dots)
  online?: string[];
  approvals?: { id: string; title: string; status: string }[];
  feedback?: { id: string; from: string; message: string; client: string; slug: string }[];
};

const listeners = new Set<(d: PulseData) => void>();
let last: PulseData | null = null;

export function onPulse(fn: (d: PulseData) => void) {
  listeners.add(fn);
  if (last) fn(last); // mounted after the first pulse: catch up at once
  return () => {
    listeners.delete(fn);
  };
}

export function emitPulse(d: PulseData) {
  last = d;
  for (const fn of listeners) fn(d);
}
