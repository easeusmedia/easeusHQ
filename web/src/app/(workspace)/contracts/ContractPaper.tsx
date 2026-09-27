"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import {
  BLANK_DETAILS,
  CONDITIONS,
  PROVIDER,
  extraKey,
  labelOf,
  runs,
  values as valuesOf,
  type Clause,
  type ContractDetails,
  type Section,
} from "@/lib/contract";
import { Dropdown } from "../Dropdown";

// The contract on paper, as it will read — or, for the master template, the
// clauses as written, marks and all. Every clause can be edited in place,
// moved, removed, or have a new one added after it.

const PLACEHOLDER = /(\{\{\s*[A-Z0-9_]+\s*\}\})/;

// text with **bold**, *italic*, and any {{PLACEHOLDER}} still in it shown as
// a tag: blue when it's a detail still missing, grey in the template
function Rich({ text, missing }: { text: string; missing: boolean }) {
  return (
    <>
      {runs(text).map((r, i) => (
        <span key={i} className={r.bold ? "font-semibold text-black" : r.italic ? "italic" : ""}>
          {r.text.split(PLACEHOLDER).map((part, j) => {
            const key = part.match(/^\{\{\s*([A-Z0-9_]+)\s*\}\}$/)?.[1];
            if (!key) return part;
            return (
              <span
                key={j}
                className={`mx-px rounded px-1 py-px text-[0.92em] font-medium not-italic ${
                  missing ? "bg-[#e6effc] text-[#1f5595] ring-1 ring-[#b4cff2]" : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {labelOf(key)}
              </span>
            );
          })}
        </span>
      ))}
    </>
  );
}

const cell = "px-3 py-2 align-top";
const th = "bg-[#f5f5f5] px-3 py-2 text-left text-[10.5px] font-semibold tracking-wide text-black";

function Table({ name, v, d }: { name: string; v: Record<string, string>; d: ContractDetails }) {
  const or = (x: string, key: string) => x || `{{${key}}}`;
  if (name === "parties") {
    return (
      <table className="my-3 w-full border border-[#ccc] text-[12px] leading-[1.55]">
        <thead>
          <tr>
            <th className={th}>SERVICE PROVIDER</th>
            <th className={`${th} border-l border-[#ccc]`}>CLIENT</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-[#ccc]">
            <td className={cell}>
              <b className="text-black">{PROVIDER.name}</b>
              <br />
              Represented by: {PROVIDER.person}
              <br />
              GST: {PROVIDER.gst}
              <br />
              {PROVIDER.location}
            </td>
            <td className={`${cell} border-l border-[#ccc]`}>
              <b className="text-black">
                <Rich text={or(v.CLIENT_ENTITY, "CLIENT_ENTITY")} missing />
              </b>
              {v.CLIENT_TRADING_NAME_LINE && (
                <>
                  <br />
                  {v.CLIENT_TRADING_NAME_LINE}
                </>
              )}
              <br />
              Represented by: <Rich text={or(v.CLIENT_SIGNATORY_LIST, "CLIENT_SIGNATORY_1")} missing />
              {d.signatories.map((s, i) => (
                <span key={i}>
                  <br />
                  Email: <Rich text={or(s.email.trim(), i ? "CLIENT_EMAIL_2" : "CLIENT_EMAIL_1")} missing />
                </span>
              ))}
              <br />
              <Rich text={or(v.CLIENT_ADDRESS, "CLIENT_ADDRESS")} missing />
              <br />
              <Rich text={or(v.CLIENT_COUNTRY, "CLIENT_COUNTRY")} missing />
            </td>
          </tr>
        </tbody>
      </table>
    );
  }
  if (name === "fee") {
    return (
      <div className="my-3 border border-[#ccc] bg-[#f5f5f5] py-3.5 text-center">
        <p className="text-[18px] font-bold text-black">
          <Rich text={or(v.MONTHLY_FEE, "MONTHLY_FEE")} missing /> / Month
        </p>
        <p className="mt-0.5 text-[11.5px] text-[#888]">
          <Rich text={or(v.TERM_LENGTH.charAt(0).toUpperCase() + v.TERM_LENGTH.slice(1), "TERM_LENGTH")} missing /> Contract · Total
          Value: <Rich text={or(v.TOTAL_VALUE, "MONTHLY_FEE")} missing />
        </p>
      </div>
    );
  }
  if (name === "scope") {
    const rows = d.deliverables.filter((x) => x.name.trim() && x.detail.trim());
    return (
      <table className="my-3 w-full border border-[#ccc] text-[12px] leading-[1.55]">
        <thead>
          <tr>
            <th className={`${th} w-[40%]`}>DELIVERABLE</th>
            <th className={`${th} border-l border-[#ccc]`}>DETAILS</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="border-t border-[#ccc]">
              <td colSpan={2} className={cell}>
                <Rich text="{{DELIVERABLES}}" missing />
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className={`border-t border-[#ccc] ${i % 2 ? "bg-[#fafafa]" : ""}`}>
              <td className={`${cell} font-semibold text-black`}>{r.name}</td>
              <td className={`${cell} border-l border-[#ccc]`}>{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  const clients = d.signatories.filter((s) => s.name.trim());
  const box = (label: string, org: string, person: string) => (
    <div className="w-[87.5%] border border-[#ccc] p-3 text-[12px]">
      <p className="text-[10.5px] font-semibold text-[#888]">{label}</p>
      <p className="mt-1 font-semibold text-black">
        <Rich text={org} missing />
      </p>
      <p>
        Name: <Rich text={person} missing />
      </p>
      <p className="mt-6 flex gap-1">
        Signature: <span className="flex-1 border-b border-black" />
      </p>
      <p className="mt-3 flex gap-1">
        Date: <span className="flex-1 border-b border-black" />
      </p>
    </div>
  );
  return (
    <div className="my-3 flex flex-col gap-3">
      <div className="flex justify-between">
        <div className="w-[48%]">{box("SERVICE PROVIDER", PROVIDER.name, PROVIDER.person)}</div>
        <div className="flex w-[48%] justify-end">
          {box("CLIENT", or(v.CLIENT_ENTITY, "CLIENT_ENTITY"), clients[0]?.name.trim() || "{{CLIENT_SIGNATORY_1}}")}
        </div>
      </div>
      {clients[1] && (
        <div className="flex justify-end">
          <div className="flex w-[48%] justify-end">{box("CLIENT", or(v.CLIENT_ENTITY, "CLIENT_ENTITY"), clients[1].name.trim())}</div>
        </div>
      )}
    </div>
  );
}

// Every placeholder a clause can use, for the "Insert a detail" menu
const KEYS = Object.keys(valuesOf(BLANK_DETAILS, "2026-01-01")).filter((k) => k !== "DELIVERABLES");

export function ClauseForm({
  clause,
  extraKeys = [],
  onSave,
  onCancel,
}: {
  clause: Clause;
  extraKeys?: string[];
  onSave: (c: Clause) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(clause.title);
  const [body, setBody] = useState(clause.body);
  const [when, setWhen] = useState(clause.when ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);

  function insert(key: string) {
    const el = ref.current;
    const at = el ? el.selectionStart : body.length;
    const next = `${body.slice(0, at)}{{${key}}}${body.slice(el ? el.selectionEnd : at)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + key.length + 4, at + key.length + 4);
    });
  }

  return (
    <div className="fade-in -mx-3 my-2 flex flex-col gap-3 rounded-xl popover p-4 font-sans text-foreground shadow-2xl">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Clause title"
        className="w-full bg-transparent text-base font-semibold outline-none! placeholder:text-muted/60"
      />
      <textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="The clause's text. Leave a blank line between paragraphs."
        className="field-sizing-content max-h-[60vh] min-h-32 w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm leading-relaxed outline-none! focus:border-hover"
      />
      <p className="text-xs leading-relaxed text-muted">
        <code className="text-foreground/80">{"{{…}}"}</code> inserts a detail · A paragraph starting with{" "}
        <code className="text-foreground/80">[trial]</code>, <code className="text-foreground/80">[split]</code>… only appears when it
        applies · <code className="text-foreground/80">- </code> starts a bullet · <code className="text-foreground/80">**bold**</code>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Dropdown
          size="sm"
          value=""
          placeholder="Insert a detail"
          search={{ recent: 12, placeholder: "Find a detail" }}
          options={[...KEYS, ...extraKeys].map((k) => ({ value: k, label: labelOf(k) }))}
          onChange={insert}
        />
        <Dropdown
          size="sm"
          value={when}
          placeholder="Always"
          options={CONDITIONS.map((c) => ({ value: c.value, label: `Include: ${c.label}` }))}
          onChange={setWhen}
        />
        <span className="flex-1" />
        <button type="button" onClick={onCancel} className="btn btn-sm btn-ghost">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave({ ...clause, title: title.trim() || "Untitled clause", body, ...(when ? { when } : { when: undefined }) })}
          className="btn btn-sm btn-glow"
        >
          Save clause
        </button>
      </div>
    </div>
  );
}

// One clause's hover tools
function Tools({ onEdit, onUp, onDown, onRemove }: { onEdit: () => void; onUp?: () => void; onDown?: () => void; onRemove: () => void }) {
  const b = "flex size-7 items-center justify-center rounded-md text-[#777] transition-colors hover:bg-black/[0.06] hover:text-black";
  return (
    <div className="absolute -top-1 right-0 flex items-center gap-0.5 rounded-lg bg-white/95 p-0.5 opacity-0 shadow-sm ring-1 ring-black/5 transition-opacity group-hover/clause:opacity-100 group-focus-within/clause:opacity-100">
      <button type="button" onClick={onEdit} aria-label="Edit clause" className={b}>
        <Pencil size={13} />
      </button>
      {onUp && (
        <button type="button" onClick={onUp} aria-label="Move up" className={b}>
          <ArrowUp size={13} />
        </button>
      )}
      {onDown && (
        <button type="button" onClick={onDown} aria-label="Move down" className={b}>
          <ArrowDown size={13} />
        </button>
      )}
      <button type="button" onClick={onRemove} aria-label="Remove clause" className={`${b} hover:text-red-600`}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function AddHere({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="group/add relative flex h-6 items-center">
      <span className="h-px flex-1 bg-transparent transition-colors group-hover/add:bg-[#9cc0ee]" />
      <button
        type="button"
        onClick={onAdd}
        className="mx-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-[#aaa] opacity-0 transition-opacity hover:text-[#1f5595] group-hover/add:opacity-100 focus:opacity-100"
      >
        <Plus size={11} /> Add clause
      </button>
      <span className="h-px flex-1 bg-transparent transition-colors group-hover/add:bg-[#9cc0ee]" />
    </div>
  );
}

const newClause = (): Clause => ({ id: crypto.randomUUID().slice(0, 8), title: "", body: "" });

export function ContractPaper({
  clauses,
  onChange,
  contract,
  readOnly = false,
}: {
  clauses: Clause[];
  onChange: (next: Clause[]) => void;
  // a real contract: the composed text; left out for the master template
  contract?: { sections: Section[]; values: Record<string, string>; details: ContractDetails; hidden: { id: string; title: string }[] };
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ at: number; clause: Clause } | null>(null);
  const extraKeys = contract?.details.extra.map((e) => extraKey(e.key)).filter(Boolean) ?? [];

  const indexOf = (id: string) => clauses.findIndex((c) => c.id === id);
  const replace = (c: Clause) => onChange(clauses.map((x) => (x.id === c.id ? c : x)));
  const move = (id: string, by: number) => {
    const i = indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= clauses.length) return;
    const next = [...clauses];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (id: string) => onChange(clauses.filter((c) => c.id !== id));
  const startAdd = (at: number) => {
    setEditing(null);
    setAdding({ at, clause: newClause() });
  };

  // what's drawn: the composed sections of a contract, or every clause of the template
  const items = contract
    ? contract.sections.map((s) => ({ id: s.id, number: s.number, title: s.title, content: s, when: undefined as string | undefined }))
    : clauses.map((c, i) => ({ id: c.id, number: i + 1, title: c.title, content: null, when: c.when }));

  const addForm = (after: number) =>
    adding &&
    adding.at === after && (
      <ClauseForm
        clause={adding.clause}
        extraKeys={extraKeys}
        onCancel={() => setAdding(null)}
        onSave={(c) => {
          const next = [...clauses];
          next.splice(adding.at, 0, c);
          onChange(next);
          setAdding(null);
        }}
      />
    );

  return (
    <article className="mx-auto w-full max-w-[760px] rounded-sm bg-white px-8 py-10 font-[Helvetica,Arial,sans-serif] text-[12.5px] leading-[1.6] text-[#222] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] sm:px-14 sm:py-14">
      <header>
        <h2 className="text-[26px] font-bold tracking-tight text-black">SERVICE AGREEMENT</h2>
        <p className="mt-0.5 text-[12.5px] text-[#888]">
          Easeus Media · {contract ? <Rich text={contract.values.CLIENT_ENTITY || "{{CLIENT_ENTITY}}"} missing /> : "Client"}
        </p>
        <p className="text-[11.5px] text-[#888]">{contract ? contract.values.SIGNING_DATE : "Signing date"}</p>
        <div className="mt-3 border-b-2 border-black" />
        <div className="mt-0.5 border-b-[0.5px] border-black" />
      </header>

      {!readOnly && addForm(0)}
      {items.map((item) => {
        const i = indexOf(item.id);
        const clause = clauses[i];
        return (
          <section key={item.id} className="group/clause relative mt-7">
            {editing === item.id && clause ? (
              <ClauseForm
                clause={clause}
                extraKeys={extraKeys}
                onCancel={() => setEditing(null)}
                onSave={(c) => {
                  replace(c);
                  setEditing(null);
                }}
              />
            ) : (
              <>
                {!readOnly && clause && (
                  <Tools
                    onEdit={() => {
                      setAdding(null);
                      setEditing(item.id);
                    }}
                    onUp={i > 0 ? () => move(item.id, -1) : undefined}
                    onDown={i < clauses.length - 1 ? () => move(item.id, 1) : undefined}
                    onRemove={() => remove(item.id)}
                  />
                )}
                <h3 className="mb-2.5 flex items-baseline border-b-[0.75px] border-black pb-1 text-[15px] font-bold text-black">
                  <span className="w-8 shrink-0">{item.number}.</span>
                  {item.title || "Untitled clause"}
                  {item.when && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-px text-[10.5px] font-medium text-slate-500">
                      {CONDITIONS.find((c) => c.value === item.when)?.label ?? item.when}
                    </span>
                  )}
                </h3>
                {item.content
                  ? item.content.blocks.map((b, k) =>
                      b.kind === "p" ? (
                        <p key={k} className="mb-2 text-justify">
                          <Rich text={b.text} missing />
                        </p>
                      ) : b.kind === "bullets" ? (
                        <ul key={k} className="mb-2 flex flex-col gap-1 pl-5">
                          {b.items.map((it, j) => (
                            <li key={j} className="list-disc text-justify">
                              <Rich text={it} missing />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <Table key={k} name={b.name} v={contract!.values} d={contract!.details} />
                      )
                    )
                  : clause.body.split(/\n\s*\n/).map((para, k) => {
                      const cond = para.trim().match(/^\[(?!\[)([^\]]*)\]\s*/);
                      const rest = cond ? para.trim().slice(cond[0].length) : para.trim();
                      const table = rest.match(/^\[\[(\w+)\]\]$/);
                      return (
                        <div key={k} className="mb-2 whitespace-pre-line">
                          {cond && (
                            <span className="mr-1.5 rounded bg-[#eef4fd] px-1.5 py-px text-[10.5px] font-medium text-[#1f5595] ring-1 ring-[#c8dbf5]">
                              {CONDITIONS.find((c) => c.value === cond[1].trim())?.label ?? cond[1]}
                            </span>
                          )}
                          {table ? (
                            <span className="block rounded border border-dashed border-[#ccc] bg-[#f7f7f7] px-3 py-2 text-center text-[11.5px] text-[#888]">
                              {{ parties: "The parties table", fee: "The fee box", scope: "The deliverables table", signatures: "The signature blocks" }[table[1]] ?? table[0]}
                            </span>
                          ) : (
                            <Rich text={rest} missing={false} />
                          )}
                        </div>
                      );
                    })}
              </>
            )}
            {!readOnly && <AddHere onAdd={() => startAdd(i + 1)} />}
            {!readOnly && addForm(i + 1)}
          </section>
        );
      })}

      <footer className="mt-10">
        <div className="border-b-2 border-black" />
        <div className="mt-0.5 border-b-[0.5px] border-black" />
        <p className="mt-2 text-center text-[11.5px] text-[#888]">End of Agreement</p>
      </footer>

      {/* the clauses this contract has but that don't apply to its terms —
          there to see, and to edit into shape if one should apply */}
      {contract && contract.hidden.length > 0 && !readOnly && (
        <div className="mt-8 rounded-lg bg-[#f6f6f6] px-4 py-3 font-sans text-[12px] text-[#777]">
          Not included under the current terms:{" "}
          {contract.hidden.map((h, k) => (
            <span key={h.id}>
              <button type="button" onClick={() => setEditing(h.id)} className="text-[#333] underline decoration-[#bbb] underline-offset-2 hover:decoration-[#333]">
                {h.title}
              </button>
              {k < contract.hidden.length - 1 ? ", " : ""}
            </span>
          ))}
          {editing && contract.hidden.some((h) => h.id === editing) && (
            <ClauseForm
              clause={clauses[indexOf(editing)]}
              extraKeys={extraKeys}
              onCancel={() => setEditing(null)}
              onSave={(c) => {
                replace(c);
                setEditing(null);
              }}
            />
          )}
        </div>
      )}
    </article>
  );
}
