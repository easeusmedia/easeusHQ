// On a desktop (1024px and wider) the /start card keeps one composition on
// every screen: it's scaled as a whole (CSS zoom, so text stays sharp) to
// the window's height, smaller on a short laptop, a little larger on a big
// monitor. Phones get the form on its own and aren't touched. Until this
// runs, globals.css scales it from the window's height alone (#start-card),
// so the first paint is already right; this makes it exact.
export function fitCard() {
  const card = document.getElementById("start-card");
  const root = document.documentElement;
  if (!card) return;
  if (window.innerWidth < 1024) return root.style.removeProperty("--card-zoom");
  // its scale now: globals.css's first guess, or the last fit
  const zoom = parseFloat(getComputedStyle(card).zoom) || 1;
  // its own height, unscaled; the page keeps 40px above and below it
  const height = card.getBoundingClientRect().height / zoom;
  const next = Math.max(0.6, Math.min(1.6, (window.innerHeight - 80) / height));
  if (Math.abs(next - zoom) > 0.005) root.style.setProperty("--card-zoom", next.toFixed(3));
}
