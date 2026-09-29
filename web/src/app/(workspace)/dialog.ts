import type React from "react";

// Closing a dialog by clicking the dim area around it: spread onto the
// <dialog> ({...closeOnBackdrop}). A click event alone can't tell that area
// from others that land on the <dialog> element too: its own padding, and a
// press inside let go outside (selecting text past the edge). And a click
// out there while one of its menus is open is meant for the menu, not the
// dialog. So the press and the release both have to land outside the box,
// with none of its menus open when the press began.
const armed = new WeakSet<HTMLDialogElement>();

function outside(e: React.MouseEvent<HTMLDialogElement>) {
  const box = e.currentTarget.getBoundingClientRect();
  return e.target === e.currentTarget && (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom);
}

export const closeOnBackdrop = {
  onMouseDown(e: React.MouseEvent<HTMLDialogElement>) {
    // every menu trigger says it's open (aria-expanded)
    if (outside(e) && !e.currentTarget.querySelector('[aria-expanded="true"]')) armed.add(e.currentTarget);
    else armed.delete(e.currentTarget);
  },
  onClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (outside(e) && armed.has(e.currentTarget)) e.currentTarget.close();
    armed.delete(e.currentTarget);
  },
};
