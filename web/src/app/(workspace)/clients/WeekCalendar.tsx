"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Megaphone, Send } from "lucide-react";

export type WeekEntry = { day: string; kind: "delivery" | "posting"; title: string };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// how many a day lists before "+N"
const SHOWN = 3;

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// the Monday of the week `day` falls in
const monday = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
const label = (day: string) => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

// One week of a client's dates, in as little room as it takes: when work
// is delivered to them and when it goes live on their channel. Starts on
// this week; the arrows step a week at a time.
export function WeekCalendar({ entries, today }: { entries: WeekEntry[]; today: string }) {
  const [start, setStart] = useState(() => monday(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const thisWeek = start === monday(today);
  const arrow = "flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground";

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">
          {thisWeek ? "This week" : "Week of"} <span className="ml-1 text-xs font-normal text-muted">{label(days[0])} – {label(days[6])}</span>
        </h2>
        <div className="flex items-center gap-1">
          {!thisWeek && (
            <button type="button" onClick={() => setStart(monday(today))} className="btn btn-xs btn-ghost mr-1">
              Today
            </button>
          )}
          <button type="button" aria-label="Previous week" onClick={() => setStart(addDays(start, -7))} className={arrow}>
            <ChevronLeft size={15} />
          </button>
          <button type="button" aria-label="Next week" onClick={() => setStart(addDays(start, 7))} className={arrow}>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      {/* a phone scrolls the week sideways rather than squeezing it */}
      <div className="overflow-x-auto">
        <div className="grid min-w-[42rem] grid-cols-7 overflow-hidden rounded-xl border border-border">
          {days.map((day, i) => {
            const on = entries.filter((e) => e.day === day);
            return (
              <div key={day} className={`flex min-h-20 min-w-0 flex-col gap-1 p-2 ${i ? "border-l border-border" : ""} ${day === today ? "bg-accent/[0.06]" : ""}`}>
                <p className={`text-[12px] ${day === today ? "font-medium text-accent" : "text-muted"}`}>
                  {WEEKDAYS[i]} {Number(day.slice(8))}
                </p>
                {on.slice(0, SHOWN).map((e, j) => (
                  <p key={j} title={`${e.kind === "delivery" ? "Delivery" : "Posting"}: ${e.title}`} className="flex min-w-0 items-center gap-1 text-[12px] leading-4">
                    {e.kind === "delivery" ? <Send size={10} className="shrink-0 text-violet-400" /> : <Megaphone size={10} className="shrink-0 text-pink-400" />}
                    <span className="truncate">{e.title}</span>
                  </p>
                ))}
                {on.length > SHOWN && <p className="text-[12px] text-muted">+{on.length - SHOWN} more</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
