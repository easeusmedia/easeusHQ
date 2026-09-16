// How many columns go in a row once the container is `width` wide (rem):
// as many as fit at `min` each, spread into even rows — six become three and
// three, not five and a stray one.
export function perRow(width: number, n: number, min: number, gap = 1) {
  const fits = Math.max(1, Math.floor((width + gap) / (min + gap)));
  return fits >= n ? n : Math.ceil(n / Math.ceil(n / fits));
}
