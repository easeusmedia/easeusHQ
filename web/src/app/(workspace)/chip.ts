// The one look for an optional property in a task composer (Client, Due,
// Type, "⋯"…), used by the composer itself and by Dropdown's and
// DatePicker's chip modes — it was three copies of a dashed outline, which
// read as a wireframe rather than something finished.
//
// A hairline outline and the barest wash of fill, so each chip reads as a
// button — rounded, clearly clickable — without the grey pill that looked
// muddy on a near-black page. Each property's icon carries its own colour
// (set where the chip is made); the word is muted until it holds a value,
// then full white with a slightly firmer outline. Tinted from the text
// colour, so it holds in either theme.
export const chip = (set: boolean) =>
  `flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 ${
    set
      ? "border-foreground/15 bg-foreground/[0.04] text-foreground hover:border-foreground/25"
      : "border-foreground/10 bg-foreground/[0.02] text-muted hover:border-foreground/20 hover:bg-foreground/[0.05] hover:text-foreground"
  }`;
