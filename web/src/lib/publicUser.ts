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
export const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
} as const;
