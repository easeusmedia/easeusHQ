"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, X } from "lucide-react";
import { Avatar } from "../TaskCard";
import { updateClientAvatar } from "./actions";
import { resizeToJpeg } from "@/lib/imageResize";

export function ClientAvatar({ clientId, name, avatarUrl }: { clientId: string; name: string; avatarUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets picking the same file again re-trigger onChange
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const dataUrl = await resizeToJpeg(file, 160, 160);
      const res = await updateClientAvatar(clientId, dataUrl);
      if (res.error) setError(res.error);
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process that image.");
    }
    setPending(false);
  }

  async function remove() {
    setPending(true);
    await updateClientAvatar(clientId, null);
    setPending(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="group relative">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote asset
          <img src={avatarUrl} alt={name} className="h-14 w-14 shrink-0 rounded-full object-cover" />
        ) : (
          <Avatar name={name} size={56} />
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          title="Change photo"
          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-100"
        >
          <Camera size={16} />
        </button>
        {avatarUrl && !pending && (
          <button
            type="button"
            onClick={remove}
            title="Remove photo"
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface-2 text-muted hover:text-red-300"
          >
            <X size={11} />
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
      {error && <p className="max-w-24 text-center text-[10px] text-red-300">{error}</p>}
    </div>
  );
}
