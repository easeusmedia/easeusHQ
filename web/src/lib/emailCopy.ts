// A message's bold and links (Abhishek, 9 Nov 2026): **words** and
// [words](https://link) in its text. Copied, an email pastes into Gmail as
// Gmail's own writing: its font, real bullets, the bold and the links, never
// the app's look.
const MARK = /\*\*(.+?)\*\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
// "• Drive ~1M views", "- Drive ~1M views"
const BULLET = /^\s*[•-]\s+/;

export type Run = { text: string; bold?: true; href?: string };

export function marks(text: string): Run[] {
  const runs: Run[] = [];
  let at = 0;
  for (const m of text.matchAll(MARK)) {
    if (m.index > at) runs.push({ text: text.slice(at, m.index) });
    runs.push(m[1] != null ? { text: m[1], bold: true } : { text: m[2], href: m[3] });
    at = m.index + m[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at) });
  return runs;
}

// the words alone, for Instagram, LinkedIn and plain-text pastes
export const plainText = (text: string) => marks(text).map((r) => r.text).join("");

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const inline = (line: string) => marks(line).map((r) => (r.bold ? `<b>${esc(r.text)}</b>` : r.href ? `<a href="${esc(r.href)}">${esc(r.text)}</a>` : esc(r.text))).join("");

// as a written email reads: words between blank lines a paragraph, a line
// break inside one a <br>, bullet lines a list. The gap between paragraphs is
// a margin on each, never an empty line, so it pastes with no extra space;
// no font, so it takes the email's own. One wrapper with Gmail's own size and
// colour: Safari (the Dock app) stamps its page's size and colour (white in
// dark mode) on whatever is outermost, and the wrapper's own win
const WRAP = '<div dir="ltr" style="font-size:small;color:#222222">';
const GAP = 'style="margin:0 0 1em"';
export function emailHtml(text: string): string {
  const out: string[] = [];
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    let lines: string[] = [];
    let list: string[] = [];
    const close = () => {
      if (lines.length) out.push(`<p ${GAP}>${lines.join("<br>")}</p>`);
      if (list.length) out.push(`<ul ${GAP}>${list.join("")}</ul>`);
      lines = [];
      list = [];
    };
    for (const line of block.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const bullet = BULLET.test(line);
      // from words to bullets, or back: the one before ends
      if (bullet ? lines.length : list.length) close();
      if (bullet) list.push(`<li>${inline(line.replace(BULLET, ""))}</li>`);
      else lines.push(inline(line));
    }
    close();
  }
  return `${WRAP}${out.join("")}</div>`;
}

// onto the clipboard: an email with its formatting and the plain words
// alongside; any other message as plain words
export async function copyMessage(text: string, email: boolean) {
  const plain = plainText(text);
  if (!email || typeof ClipboardItem === "undefined") return navigator.clipboard.writeText(plain);
  await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([emailHtml(text)], { type: "text/html" }), "text/plain": new Blob([plain], { type: "text/plain" }) })]);
}
