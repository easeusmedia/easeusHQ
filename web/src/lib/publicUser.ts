// The only fields of a User that may cross into a client component.
//
// `include: { assignedTo: true }` returns the *whole* row — passwordHash
// included — and every task list hands its rows straight to a client
// component, so that row was being serialised into the page the browser
// receives. It became visible when User gained a Decimal `salary` (Decimals
// can't serialise, so React finally complained), but the password hash had
// been going out with it all along.
//
// Use this anywhere a user is loaded as a relation on something that reaches
// the client. Anything needing more than a name and a face should say so
// explicitly, close to where it's used and with a reason.
// No avatarUrl: that's the stored picture itself. Avatars find a person's
// photo by name (see photos.tsx), from the one list the layout loads.
export const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
} as const;

// The same for a Client loaded as a relation. Its row carries its logo (a
// stored picture) and pages of notes: `include: { client: true }` on a list
// of tasks sent all of that to the browser once per task, on every refresh
// (the Production board was over a megabyte). Lists need a client's name and
// address; anything needing more says so where it's used.
export const PUBLIC_CLIENT_SELECT = {
  id: true,
  name: true,
  slug: true,
} as const;
