// What a page shows the moment it's clicked, while its data is on the way:
// its own shape in soft blocks (a title, tiles, cards, rows, a board), in
// the app's panels, rather than a spinner on an empty page. Each route's
// loading.tsx puts the pieces together to match the page behind it. No
// client code: plain markup, and the pulse stops for anyone who's asked for
// less motion.

const BONE = "block bg-foreground/[0.08] motion-safe:animate-pulse";

// One soft block. Rounded a little unless the caller says how (a pill, a
// face): two rounding classes on one element would leave it to chance.
export function Bone({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`${BONE} ${/\brounded/.test(className) ? "" : "rounded-md"} ${className}`} />;
}

// The frame every loading page sits in: announced once, quietly
export function SkeletonPage({ children, className = "flex flex-col gap-6" }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-label="Loading" aria-busy className={`fade-in ${className}`}>
      {children}
    </div>
  );
}

// A page's heading: its title, and the line under it when it has one
export function SkeletonTitle({ sub = false, action = false }: { sub?: boolean; action?: boolean }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex flex-col gap-2.5">
        <Bone className="h-7 w-48" />
        {sub && <Bone className="h-3.5 w-72 max-w-[60vw]" />}
      </div>
      {action && <Bone className="h-9 w-32 rounded-full" />}
    </div>
  );
}

// A row of choices: tabs, a view switch, filters
export function SkeletonChips({ n = 3 }: { n?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {Array.from({ length: n }, (_, i) => (
        <Bone key={i} className={`h-8 rounded-full ${i === 0 ? "w-28" : "w-20"}`} />
      ))}
    </div>
  );
}

// The number tiles at the top of a page
export function SkeletonTiles({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="panel flex flex-col gap-3 rounded-2xl px-5 py-4">
          <Bone className="h-8 w-14" />
          <Bone className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

// A grid of cards: clients, departments, projects
export function SkeletonCards({ n = 6, className = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" }: { n?: number; className?: string }) {
  return (
    <div className={className}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="panel flex flex-col gap-4 rounded-3xl p-5">
          <div className="flex items-center gap-3.5">
            <Bone className="size-11 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Bone className="h-4 w-2/3" />
              <Bone className="h-3 w-1/3" />
            </div>
          </div>
          <Bone className="h-3 w-1/2" />
          <Bone className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

// A list in a panel: a title bar, then rows with a face at the end
export function SkeletonRows({ n = 7, title = true, className = "" }: { n?: number; title?: boolean; className?: string }) {
  return (
    <div className={`panel flex flex-col rounded-2xl ${className}`}>
      {title && (
        <div className="flex items-center gap-3 px-5 py-4">
          <Bone className="size-7 rounded-lg" />
          <Bone className="h-4 w-36" />
        </div>
      )}
      <div className="flex flex-col gap-2 px-3 pb-3">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="panel-soft flex items-center gap-3 rounded-2xl px-4 py-3">
            <div className="flex flex-1 flex-col gap-2">
              <Bone className={`h-3.5 ${i % 3 === 0 ? "w-1/2" : i % 3 === 1 ? "w-2/3" : "w-2/5"}`} />
              <Bone className="h-3 w-1/4" />
            </div>
            <Bone className="h-5 w-16 rounded-full" />
            <Bone className="size-7 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// A board: stage headings across, a few cards under each
const CARDS = [3, 2, 3, 1, 2, 1];
export function SkeletonBoard({ cols = 5 }: { cols?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: cols }, (_, c) => (
        <div key={c} className="flex w-[17.5rem] shrink-0 flex-col gap-2">
          <Bone className="h-9 rounded-full" />
          {Array.from({ length: CARDS[c % CARDS.length] }, (_, i) => (
            <div key={i} className="panel-soft flex flex-col gap-2.5 rounded-2xl p-3.5">
              <Bone className="h-3 w-1/3" />
              <Bone className="h-4 w-4/5" />
              <div className="flex items-center gap-2 pt-1">
                <Bone className="size-6 rounded-full" />
                <Bone className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
