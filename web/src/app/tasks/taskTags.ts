// The kinds of work the team actually does, seeded once so the tag list
// isn't empty on day one. Ops can add more from the task dialog; this is a
// starting point, not a closed set.
//
// clientFacing marks the work that produces something the client receives —
// a cut, a reel, a thumbnail, a post. The rest is real work done for that
// client that never leaves the studio: audio engineering, colour correction,
// channel management. That split is what decides whether a task defaults to
// a deliverable (flows through client approval and lands in the client's
// project) or to internal work (tracked against the client, but not
// something they're ever handed).
export const DEFAULT_TASK_TAGS: { name: string; clientFacing: boolean }[] = [
  { name: "Podcast editing", clientFacing: true },
  { name: "Reel", clientFacing: true },
  { name: "Trailer", clientFacing: true },
  { name: "Thumbnail", clientFacing: true },
  { name: "Graphic", clientFacing: true },
  { name: "Social media post", clientFacing: true },
  { name: "Audio engineering", clientFacing: false },
  { name: "Colour correction", clientFacing: false },
  { name: "YouTube management", clientFacing: false },
  { name: "Sales", clientFacing: false },
];
