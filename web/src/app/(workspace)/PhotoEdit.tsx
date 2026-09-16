"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, X } from "lucide-react";
import { Avatar } from "./TaskCard";
import { resizeToJpeg } from "@/lib/imageResize";

// A round picture you can change in place: hover for the camera, the ✕
// removes it. Used for a client's logo and for a person's photo — `save` is
// the server action that stores it (null clears it back to initials).
export function PhotoEdit({
  name,
  src,
  size = 56,
  person = false,
  save,
}: {
  name: string;
  src: string | null;
  // pixels, or "fill" for as big as its box (ProfileHead)
  size?: number | "fill";
  // a teammate: drawn by the shared avatar, so it gets their online dot too
  person?: boolean;
  save: (dataUrl: string | null) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function store(file: File | null) {
    setPending(true);
    setError(null);
    try {
      const res = await save(file ? await resizeToJpeg(file, 160, 160) : null);
      if (res.error) setError(res.error);
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process that image.");
    }
    setPending(false);
  }

  return (
    <div className={`flex flex-col items-center gap-1 ${size === "fill" ? "size-full" : ""}`}>
      <div className={`group relative ${size === "fill" ? "size-full" : ""}`}>
        {person ? (
          <Avatar name={name} size={size} />
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small, already-resized picture behind sign-in
          <img src={src} alt={name} className="photo" style={size === "fill" ? { width: "100%", height: "100%" } : { width: size, height: size }} />
        ) : (
          <Avatar name={name} size={size} />
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          title={src ? "Change photo" : "Add a photo"}
          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-100"
        >
          <Camera size={16} />
        </button>
        {src && !pending && (
          <button
            type="button"
            onClick={() => store(null)}
            title="Remove photo"
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface-2 text-muted opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
          >
            <X size={11} />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // picking the same file again still counts
          if (file) store(file);
        }}
        className="hidden"
      />
      {error && <p className="max-w-24 text-center text-xs text-red-300">{error}</p>}
    </div>
  );
}
