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
  `flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors duration-150 ${
    set
      ? "bg-foreground/[0.08] text-foreground hover:bg-foreground/[0.11]"
      : "bg-foreground/[0.04] text-muted hover:bg-foreground/[0.07] hover:text-foreground"
  }`;
