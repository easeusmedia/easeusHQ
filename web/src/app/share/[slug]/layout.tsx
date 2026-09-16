import Image from "next/image";

// A client's shared pages: Easeus Media across the top, then the page.
export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-center gap-2 border-b border-border py-4">
        <Image src="/logo.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" priority />
        <span className="text-sm font-semibold tracking-tight">Easeus Media</span>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}
