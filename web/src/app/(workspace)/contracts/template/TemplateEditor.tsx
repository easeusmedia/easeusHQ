"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
import type { Clause } from "@/lib/contract";
import { ConfirmButton } from "../../ConfirmButton";
import { ContractPaper } from "../ContractPaper";
import { resetTemplate, saveTemplate } from "../actions";

// Edit the clauses every new contract starts from. Contracts already made
// keep their own copy — a change here doesn't reach back into them.
export function TemplateEditor({ clauses: initial }: { clauses: Clause[] }) {
  const [clauses, setClauses] = useState(initial);
  const [note, setNote] = useState<string | null>(null);

  async function change(next: Clause[]) {
    setClauses(next);
    const res = await saveTemplate(next);
    setNote(res.error ?? "Saved");
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/contracts" aria-label="All contracts" className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground">
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight">Master template</h1>
          <p className="text-xs text-muted">
            The clauses every new contract starts from. Blue tags show when a paragraph applies; grey ones fill in from each
            contract&apos;s details.
            {note && <span className="fade-in"> · {note}</span>}
          </p>
        </div>
        <ConfirmButton
          message="Put the template back to the SOP's clauses? Your edits to it are lost (contracts already made keep theirs)."
          onConfirm={async () => {
            const res = await resetTemplate();
            if (res.clauses) setClauses(res.clauses);
            setNote(res.error ?? "Back to the SOP's clauses");
          }}
          className="btn btn-ghost flex items-center gap-1.5"
        >
          <RotateCcw size={14} /> Reset to SOP
        </ConfirmButton>
      </div>
      <div className="rounded-2xl bg-black/25 p-3 sm:p-8">
        <ContractPaper clauses={clauses} onChange={change} />
      </div>
    </div>
  );
}
