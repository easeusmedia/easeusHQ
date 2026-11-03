import type { Notice as Row } from "@prisma/client";
import { dayOf, shortDay } from "@/lib/editorKpi";
import type { Notice } from "./HomeView";

// A saved notice as the Notices panel shows it: what kind, its line, who
// passed it on (or wrote it) and when, and the task it's about, to open
export const noticeOf = (n: Row, fresh: boolean): Notice => ({
  key: n.id,
  id: n.id,
  kind: n.kind === "overdue" ? "overdue" : n.kind === "shared" ? "shared" : "note",
  tone: n.kind === "overdue" ? "rose" : n.kind === "shared" ? "accent" : "neutral",
  text: n.body,
  sub: [n.forwardedBy ? `Forwarded by ${n.forwardedBy}` : n.kind === "note" ? n.by : null, shortDay(dayOf(n.createdAt))].filter(Boolean).join(" · "),
  remark: n.remark,
  forwardedBy: n.forwardedBy,
  forwardRemark: n.forwardRemark,
  open: n.taskId ? `t${n.taskId}` : n.workTaskId ? `w${n.workTaskId}` : undefined,
  fresh,
});
