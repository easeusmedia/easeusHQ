"use client";

import { useEffect } from "react";
import { fitCard } from "./fit";

// Keeps the /start card fitted (fit.ts) as the window changes size, or the
// card does (an error line under a field)
export function FitCard() {
  useEffect(() => {
    const card = document.getElementById("start-card");
    const watch = new ResizeObserver(fitCard);
    if (card) watch.observe(card);
    window.addEventListener("resize", fitCard);
    fitCard();
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", fitCard);
      document.documentElement.style.removeProperty("--card-zoom");
    };
  }, []);
  return null;
}
