"use client";

import { LETTERS, LETTER_LABEL, type Letter } from "@/lib/videoScore";
import { GRADE_STYLE } from "./gradeStyle";

// The quality inspection's grade: six letters, one tap
export function GradePicker({ value, onChange }: { value: string; onChange: (grade: Letter) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Grade this video</p>
      <div className="grid grid-cols-6 gap-1.5">
        {LETTERS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => onChange(l)}
            title={LETTER_LABEL[l]}
            aria-pressed={value === l}
            className={`rounded-lg py-2 text-sm font-semibold transition-colors ${value === l ? GRADE_STYLE[l] : "bg-surface-2 text-muted hover:text-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{value ? LETTER_LABEL[value as Letter] : "Grade the craft. Mistakes are taken off for you."}</p>
    </div>
  );
}
