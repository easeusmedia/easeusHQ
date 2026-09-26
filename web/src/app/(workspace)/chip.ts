// The one look for an optional property in a task composer (Client, Due,
// Type, "⋯"…), used by the composer itself and by Dropdown's and
// DatePicker's chip modes — it was three copies of a dashed outline, which
// read as a wireframe rather than something finished.
//
// No border and no grey fill: a grey pill on a near-black page reads as
// muddy. At rest a chip is just its icon — each property its own colour, so
// the row can be read at a glance — and its word, muted until it holds a
// value and then full white. A faint highlight comes up on hover only, to
// say it can be clicked. Tinted from the text colour, so it holds in either
// theme; the icon colours are set where each chip is made.
export const chip = (set: boolean) =>
  `flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors duration-150 hover:bg-foreground/[0.07] ${
    set ? "text-foreground" : "text-muted hover:text-foreground"
  }`;
