"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, X } from "lucide-react";
import { Avatar } from "../TaskCard";
import { updateClientAvatar } from "./actions";

// Downscales to a small square JPEG before it ever leaves the browser —
// there's no object storage wired up (see the schema comment on
// Client.avatarUrl), so this goes straight into the DB as a data: URI, and
// staying small is what keeps that reasonable.
function resizeToSquareJpeg(file: File, size = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported."));
        // center-crop to a square before scaling down, so a non-square
        // photo doesn't come out squished
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

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
      const dataUrl = await resizeToSquareJpeg(file);
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
