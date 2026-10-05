"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";
import { checkAccount } from "@/lib/account";
import { resizeToJpeg } from "@/lib/imageResize";
import { closeOnBackdrop } from "./dialog";
import { Reveal } from "./Reveal";
import { updateAccount } from "./account";
import { usePhoto } from "./photos";
import { Avatar } from "./TaskCard";
import { updatePersonPhoto } from "./team/actions";

const INPUT = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-hover disabled:opacity-60";

// Your own account, from the profile menu: your photo (saved as soon as it's
// picked), your name and the email you sign in with, and a "Change
// password" button that opens the password fields only when asked for. A new
// email or password needs the current password, which appears only then.
// Opens on `open`.
export function AccountDialog({ open, onClose, account }: { open: boolean; onClose: () => void; account: { id: string; name: string; email: string } }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const [newPassword, setNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [show, setShow] = useState(false);
  // the password fields stay away until "Change password" is pressed
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoState, setPhotoState] = useState<string | null>(null);
  const hasPhoto = !!usePhoto(account.name);

  async function setPhoto(file: File | null) {
    setPhotoState("Saving…");
    try {
      const res = await updatePersonPhoto(account.id, file ? await resizeToJpeg(file, 160, 160) : null);
      setPhotoState(res.error ?? null);
      if (!res.error) router.refresh();
    } catch {
      setPhotoState("That image couldn't be read. Please try a JPEG or PNG.");
    }
  }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      // start from the account as it stands now
      setName(account.name);
      setEmail(account.email);
      setNewPassword("");
      setCurrentPassword("");
      setShow(false);
      setChanging(false);
      setError(null);
      setBusy(false);
      setPhotoState(null);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open, account.name, account.email]);

  const emailChanged = email.trim().toLowerCase() !== account.email;
  const needsPassword = emailChanged || changing;
  const changed = name.trim() !== account.name || emailChanged || (changing && !!newPassword);

  // back to keeping the password: whatever was typed is forgotten
  function keepPassword() {
    setChanging(false);
    setNewPassword("");
    if (!emailChanged) setCurrentPassword("");
    setError(null);
  }

  async function save() {
    if (busy) return;
    if (changing && !newPassword) return setError("Enter a new password, or keep your current one.");
    const input = { name, email, currentPassword, newPassword: changing ? newPassword : "" };
    // the same checks the server makes, before the trip
    const checked = checkAccount(input, account);
    if ("error" in checked) return setError(checked.error);
    setBusy(true);
    setError(null);
    const res = await updateAccount(input).catch(() => ({ error: "That couldn't be saved. Check your connection and try again." }));
    setBusy(false);
    if (res.error) return setError(res.error);
    onClose();
    router.refresh();
  }

  return (
    <dialog
      ref={ref}
      {...closeOnBackdrop}
      onClose={() => open && onClose()}
      className="glass fixed top-1/2 left-1/2 m-0 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground"
    >
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h2 className="text-base font-semibold">Your account</h2>

        <div className="flex items-center gap-3">
          <Avatar name={account.name} size={48} presence={false} />
          <div className="flex min-w-0 flex-col items-start gap-1">
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => photoInput.current?.click()} className="btn btn-sm btn-glow flex items-center gap-1.5">
                <Camera size={13} /> {hasPhoto ? "Change photo" : "Add a photo"}
              </button>
              {hasPhoto && (
                <button type="button" onClick={() => setPhoto(null)} className="btn btn-sm btn-ghost flex items-center gap-1.5">
                  <Trash2 size={13} /> Remove
                </button>
              )}
            </div>
            {photoState && <p className="fade-in text-xs text-muted">{photoState}</p>}
          </div>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // picking the same file again still counts
              if (file) setPhoto(file);
            }}
          />
        </div>

        <label className="flex flex-col gap-1.5 text-xs text-muted">
          Name
          <input value={name} disabled={busy} onChange={(e) => setName(e.target.value)} autoComplete="name" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted">
          Email
          <input type="email" value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} autoComplete="username" className={INPUT} />
        </label>
        {/* the password: left alone until asked for */}
        {!changing ? (
          <button type="button" onClick={() => setChanging(true)} className="btn btn-sm btn-glow flex items-center gap-1.5 self-start">
            <KeyRound size={13} /> Change password
          </button>
        ) : (
          <div className="fade-in flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              <span className="flex items-center justify-between">
                New password
                <button type="button" onClick={keepPassword} className="text-xs text-muted transition-colors hover:text-foreground">
                  Keep current password
                </button>
              </span>
              <span className="relative">
                <input
                  autoFocus
                  type={show ? "text" : "password"}
                  value={newPassword}
                  disabled={busy}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className={`${INPUT} pr-9`}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  title={show ? "Hide passwords" : "Show passwords"}
                  aria-label={show ? "Hide passwords" : "Show passwords"}
                  className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:text-foreground"
                >
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </span>
            </label>
          </div>
        )}
        {/* asked for only when the email or the password is changing */}
        <Reveal open={needsPassword}>
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Current password
            <input
              type={show ? "text" : "password"}
              value={currentPassword}
              disabled={busy}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className={INPUT}
            />
          </label>
        </Reveal>

        {error && (
          <p role="alert" className="fade-in text-xs text-red-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={busy || !changed} className="btn btn-glow disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
