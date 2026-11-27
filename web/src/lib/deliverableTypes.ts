// The deliverable types the agency offers — the same shape a project's
// Files section groups by (projects/[id]/page.tsx). Fixed and shared, not
// per-client, so creating a project applies the identical structure
// regardless of which client or who's setting it up.
// Audio: the episode's processed audio, for Spotify and the other podcast apps
// YouTube Copy: the title, description and tags written for the episode (Abhishek, 27 Nov 2026)
export const DELIVERABLE_TYPES = ["YouTube Long-Form", "Reel Trailer", "Reel", "Bonus Reel", "Thumbnails", "Audio", "YouTube Copy"] as const;

// Sort order for a project's Files section — "Misc." is the catch-all
// bucket for anything that doesn't fit one of the real deliverable types
// above, so it isn't offered as a pickable type when creating a project.
export const TYPE_ORDER: string[] = [...DELIVERABLE_TYPES, "Misc."];
