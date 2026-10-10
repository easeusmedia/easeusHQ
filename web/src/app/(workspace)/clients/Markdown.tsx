// A deliberately small markdown renderer — headings, lists, tables, quotes,
// rules, links. Not a general-purpose one: the only markdown in this app is
// what scripts/sync-client-notion.ts writes out of Notion, so it only has to
// handle that subset. Pulling in react-markdown for this would be a
// dependency for ~70 lines, and wouldn't give us the hex-swatch treatment
// brand-colour tables need.
//
// ponytail: no inline emphasis (**bold**, _em_) — Notion's plain_text drops
// it anyway. Add an inline pass here if docs ever get authored by hand.

const HEX = /#[0-9a-fA-F]{6}\b/;

/** Renders text, turning any hex colour into a labelled swatch. */
function Inline({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;

  while (rest) {
    const url = rest.match(/https?:\/\/\S+/);
    const hex = rest.match(HEX);
    // whichever lands first
    const next =
      url && hex ? (url.index! < hex.index! ? url : hex) : url ?? hex;
    if (!next) break;

    parts.push(rest.slice(0, next.index));
    const token = next[0];
    if (token.startsWith("#")) {
      parts.push(
        <span key={key++} className="inline-flex items-center gap-1.5 align-middle">
          <span className="h-3 w-3 rounded-sm border border-border" style={{ backgroundColor: token }} />
          <code className="text-[12px] tracking-tight">{token}</code>
        </span>
      );
    } else {
      parts.push(
        <a key={key++} href={token} target="_blank" rel="noreferrer" className="text-blue-400 underline underline-offset-2">
          {token.replace(/^https?:\/\/(www\.)?/, "").slice(0, 42)}
          {token.length > 50 ? "…" : ""}
        </a>
      );
    }
    rest = rest.slice(next.index! + token.length);
  }
  parts.push(rest);
  return <>{parts}</>;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    if (trimmed === "---") {
      out.push(<hr key={i} className="my-4 border-border/60" />);
      i++;
    } else if (trimmed.startsWith("### ")) {
      out.push(<h4 key={i} className="mt-5 mb-1.5 text-[13px] font-semibold uppercase tracking-wide text-muted">{trimmed.slice(4)}</h4>);
      i++;
    } else if (trimmed.startsWith("## ")) {
      out.push(<h3 key={i} className="mt-6 mb-2 text-[15px] font-semibold first:mt-0"><Inline text={trimmed.slice(3)} /></h3>);
      i++;
    } else if (trimmed.startsWith("> ")) {
      out.push(
        <p key={i} className="my-3 border-l-2 border-border pl-3 text-sm italic text-muted">
          <Inline text={trimmed.slice(2)} />
        </p>
      );
      i++;
    } else if (trimmed.startsWith("|")) {
      // consecutive | rows = one table; first row is the header
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={`t${i}`} className="my-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                {head.map((c, n) => <th key={n} className="px-3 py-2 font-medium">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {body.map((row, n) => (
                <tr key={n} className="border-t border-border/60">
                  {row.map((c, m) => <td key={m} className="px-3 py-2 align-middle"><Inline text={c} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } else if (/^\s*(-|\d+\.)\s/.test(line)) {
      // one list, keeping nesting (two spaces per level from the sync script)
      const items: { depth: number; text: string; ordered: boolean }[] = [];
      while (i < lines.length && /^\s*(-|\d+\.)\s/.test(lines[i])) {
        const indent = lines[i].match(/^\s*/)![0].length;
        const ordered = /^\s*\d+\./.test(lines[i]);
        items.push({ depth: Math.floor(indent / 2), ordered, text: lines[i].replace(/^\s*(-|\d+\.)\s/, "") });
        i++;
      }
      out.push(
        <ul key={`l${i}`} className="my-2 flex flex-col gap-1.5 text-sm">
          {items.map((it, n) => (
            <li key={n} className="flex gap-2 leading-relaxed" style={{ paddingLeft: it.depth * 16 }}>
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted" />
              <span className="min-w-0"><Inline text={it.text} /></span>
            </li>
          ))}
        </ul>
      );
    } else {
      out.push(
        <p key={i} className="my-2 text-sm leading-relaxed text-muted">
          <Inline text={trimmed} />
        </p>
      );
      i++;
    }
  }

  return <div className="max-w-3xl">{out}</div>;
}
