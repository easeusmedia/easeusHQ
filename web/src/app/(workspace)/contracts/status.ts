// Where a contract stands, in words, and the colour of its pill
export function contractStage(status: string, missing: number): { label: string; tone: string } {
  if (status === "invited") return { label: "Waiting for client", tone: "border-border bg-surface-2 text-muted" };
  if (status === "draft" && missing > 0)
    return { label: `Needs ${missing} detail${missing === 1 ? "" : "s"}`, tone: "border-amber-400/30 bg-amber-400/10 text-amber-300" };
  if (status === "draft") return { label: "Ready for review", tone: "border-sky-400/30 bg-sky-400/10 text-sky-300" };
  if (status === "approved") return { label: "Approved · ready to send", tone: "border-violet-400/30 bg-violet-400/10 text-violet-300" };
  if (status === "sent") return { label: "Out for signature", tone: "border-blue-400/30 bg-blue-400/10 text-blue-300" };
  return { label: "Signed", tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" };
}
