// The one look for an optional property in a task composer (Client, Due,
// Type, "⋯"…), used by the composer itself and by Dropdown's and
// DatePicker's chip modes — it was three copies of a dashed outline, which
// read as a wireframe rather than something finished.
//
// No border at all: a faint fill while it's unset, so it still reads as
// something you can click, and a brighter fill with full-strength text once
// it holds a value. Tinted from the text colour, so it works in either theme.
export const chip = (set: boolean) =>
  `flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors duration-150 ${
    set
      ? "bg-foreground/[0.12] text-foreground hover:bg-foreground/[0.16]"
      : "bg-foreground/[0.06] text-muted hover:bg-foreground/10 hover:text-foreground"
  }`;
