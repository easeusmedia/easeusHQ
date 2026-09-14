import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { listConversations } from "../team/actions";
import { ChatDashboard, type ChatPerson } from "./ChatDashboard";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const [users, conversations] = await Promise.all([getAllUsers(), listConversations()]);
  const byPerson = new Map(conversations.map((c) => [c.userId, c]));

  // everyone on the team, not only people you've already messaged — this
  // is the org's directory as much as its inbox, so starting a first
  // conversation is just clicking a name
  const people: ChatPerson[] = users
    .filter((u) => u.id !== sessionUserId)
    .map((u) => {
      const c = byPerson.get(u.id);
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        avatarUrl: u.avatarUrl,
        lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
        lastBody: c?.lastBody ?? null,
        lastAt: c?.lastAt ? c.lastAt.toISOString() : null,
        lastFromMe: c?.lastFromMe ?? false,
        unread: c?.unread ?? 0,
      };
    })
    // unread first, then whoever spoke most recently, then the rest
    // alphabetically — the order you'd actually work down
    .sort((a, b) => {
      if (!!b.unread !== !!a.unread) return b.unread - a.unread;
      if (a.lastAt && b.lastAt) return b.lastAt.localeCompare(a.lastAt);
      if (a.lastAt) return -1;
      if (b.lastAt) return 1;
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="flex h-full flex-col gap-5">
      <h1 className="text-xl font-semibold">Chat</h1>
      <ChatDashboard people={people} meId={sessionUserId} />
    </div>
  );
}
