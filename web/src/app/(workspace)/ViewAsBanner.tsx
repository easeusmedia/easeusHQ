"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { viewAs } from "./viewAs";

// While a Level 1 is looking as someone else: who, and the way back
export function ViewAsBanner({ name, level }: { name: string; level: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="fade-in fixed top-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-accent/30 bg-background/85 py-1.5 pr-1.5 pl-4 text-sm shadow-lg backdrop-blur">
      <Eye size={14} className="text-accent" />
      <span>
        Viewing as <span className="font-medium">{name}</span> <span className="text-muted">· {level}</span>
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await viewAs(null);
          router.replace("/");
          router.refresh();
        }}
        className="btn btn-sm btn-glow rounded-full disabled:opacity-60"
      >
        Back to you
      </button>
    </div>
  );
}
