// Whether a task's name already says its client ("Elle Sera - Golden Pill"
// for Elle Sera, "FitFuel - Founder Story Ad" for FitFuel Nutrition), so a
// line repeating the client under it is only noise. Compares the name's
// lead (before " - ") with the client's name, or their first words.
export function namesClient(title: string, client: string | null | undefined): boolean {
  if (!client) return false;
  const head = title.split(/\s[-–:|]\s/)[0].trim().toLowerCase();
  const c = client.trim().toLowerCase();
  if (!head || !c) return false;
  return c.startsWith(head) || head.startsWith(c) || head.split(/\s+/)[0] === c.split(/\s+/)[0];
}
