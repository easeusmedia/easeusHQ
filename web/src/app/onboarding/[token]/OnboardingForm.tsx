"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Paperclip, X } from "lucide-react";
import { resizeToJpeg } from "@/lib/imageResize";
import { submitOnboarding } from "../actions";

type Upload = { name: string; type: string; data: string; size: number };

const field =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-muted";

const SOCIAL_FIELDS = [
  { key: "Website", placeholder: "yourbrand.com" },
  { key: "Instagram", placeholder: "instagram.com/yourbrand" },
  { key: "YouTube", placeholder: "youtube.com/@yourbrand" },
  { key: "Other", placeholder: "Podcast, LinkedIn, anything else" },
];

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Couldn't read ${file.name}`));
    reader.readAsDataURL(file);
  });

// Six questions and a file picker. Everything here is either something we
// can't start without (what they're called, how to reach them) or something
// that saves a round of emails later (their logo, their channels, their
// brand files).
export function OnboardingForm({
  token,
  suggestedName,
  canUpload,
}: {
  token: string;
  suggestedName: string;
  canUpload: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: suggestedName,
    niche: "",
    contact: "",
    email: "",
    whatsapp: "",
    address: "",
    assetsLink: "",
  });
  const [socials, setSocials] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState<string | null>(null);
  const [files, setFiles] = useState<Upload[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setLogo(await resizeToJpeg(file, 320, 320));
    } catch {
      setError("That image couldn't be read — a JPEG or PNG works best.");
    }
  }

  async function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = [...(e.target.files ?? [])];
    e.target.value = "";
    setError(null);
    try {
      const read = await Promise.all(
        chosen.map(async (f) => ({ name: f.name, type: f.type, size: f.size, data: await readAsDataUrl(f) }))
      );
      setFiles((current) => [...current, ...read].slice(0, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read those files.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await submitOnboarding({
      token,
      ...form,
      logo,
      socials: Object.entries(socials).map(([label, url]) => ({ label, url })),
      files: files.map(({ name, type, data }) => ({ name, type, data })),
    });
    setSaving(false);
    if (res.error) return setError(res.error);
    // the page itself shows the thank-you (see page.tsx)
    window.location.replace(`/onboarding/${token}?sent=${res.warning ? "partial" : "ok"}`);
  }

  const totalMb = files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      <header className="mb-8 flex flex-col items-center gap-2 text-center">
        <Image src="/logo.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" priority />
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Easeus Media</h1>
        <p className="max-w-md text-sm text-muted">
          A few details so we can set you up properly. It takes about two minutes — anything you skip we can pick up on
          our first call.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-6">
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/40 p-5">
          <h2 className="text-sm font-medium">Your brand</h2>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => logoRef.current?.click()}
              className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-surface-2 text-muted"
            >
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- a data: URI the browser just made
                <img src={logo} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1 text-xs">
                  <ImagePlus size={16} /> Logo
                </span>
              )}
            </button>
            <input ref={logoRef} type="file" accept="image/*" onChange={pickLogo} className="hidden" />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <input
                required
                autoFocus
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Brand or business name *"
                className={field}
              />
              <input
                value={form.niche}
                onChange={(e) => set({ niche: e.target.value })}
                placeholder="What you do — e.g. leadership podcast, skin clinic"
                className={field}
              />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/40 p-5">
          <h2 className="text-sm font-medium">How we reach you</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={form.contact} onChange={(e) => set({ contact: e.target.value })} placeholder="Main contact's name" className={field} />
            <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="Email" className={field} />
            <input value={form.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} placeholder="WhatsApp number" className={field} />
            <input value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="City / address" className={field} />
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/40 p-5">
          <h2 className="text-sm font-medium">Where your audience already is</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {SOCIAL_FIELDS.map((s) => (
              <input
                key={s.key}
                value={socials[s.key] ?? ""}
                onChange={(e) => setSocials((cur) => ({ ...cur, [s.key]: e.target.value }))}
                placeholder={s.placeholder}
                className={field}
              />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/40 p-5">
          <h2 className="text-sm font-medium">Brand files</h2>
          <p className="-mt-2 text-xs text-muted">
            Logos, fonts, brand guidelines, anything we should match. Skip it if you&apos;d rather send them later.
          </p>

          {canUpload ? (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="btn-add flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm"
              >
                <Paperclip size={15} /> Add files
              </button>
              <input ref={fileRef} type="file" multiple onChange={pickFiles} className="hidden" />
              {files.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="shrink-0 text-xs text-muted">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                      <button
                        type="button"
                        onClick={() => setFiles((cur) => cur.filter((_, idx) => idx !== i))}
                        aria-label={`Remove ${f.name}`}
                        className="btn-ghost shrink-0 rounded-md p-1"
                      >
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {totalMb > 0 && <p className="text-xs text-muted">{totalMb.toFixed(1)}MB in total · up to 100MB</p>}
            </>
          ) : (
            <input
              value={form.assetsLink}
              onChange={(e) => set({ assetsLink: e.target.value })}
              placeholder="Link to your brand folder (Drive, Dropbox, WeTransfer…)"
              className={field}
            />
          )}
        </section>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <button type="submit" disabled={saving} className="btn-glow rounded-xl px-5 py-3 text-sm font-medium disabled:opacity-60">
          {saving ? "Sending…" : "Send to Easeus"}
        </button>
        <p className="pb-6 text-center text-xs text-muted">Only the Easeus team sees this.</p>
      </form>
    </main>
  );
}
