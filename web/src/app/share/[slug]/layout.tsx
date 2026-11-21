import Image from "next/image";
import { Spotlight } from "../../(workspace)/Spotlight";

// A client's shared pages: Easeus Media across the top, then the page, on
// the app's own dark backdrop (the moving glow and glass cards, globals.css)
export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="dark" className="app-root flex min-h-full flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-center gap-2 border-b border-border py-4">
        <Image src="/logo.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" priority />
        <span className="text-sm font-semibold tracking-tight">Easeus Media</span>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-10">{children}</main>
      {/* the clickable cards light up where the pointer is, as in the app */}
      <Spotlight />
    </div>
  );
}
