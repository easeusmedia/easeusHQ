// The one look for an optional property in a task composer (Client, Due,
// Type, "⋯"…), used by the composer itself and by Dropdown's and
// DatePicker's chip modes — it was three copies of a dashed outline, which
// read as a wireframe rather than something finished.
//
// A soft rounded fill and no outline: each chip reads as a button — rounded,
// clearly clickable — without a stroke drawn round it. Kept faint, so it
// doesn't turn into the heavy grey pill that looked muddy on a near-black
// page; each property's icon carries its own colour (set where the chip is
// made). The word is muted until it holds a value, then full white on a
// slightly firmer fill. Tinted from the text colour, so it holds in either
// theme.
export const chip = (set: boolean) =>
  `flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors duration-200 ${
    set
      ? "border-white/[0.12] bg-white/[0.07] text-foreground hover:bg-white/[0.1]"
      : "border-white/[0.06] bg-white/[0.02] text-muted hover:border-white/[0.12] hover:text-foreground"
  }`;
