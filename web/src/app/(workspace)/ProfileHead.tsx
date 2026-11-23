// A profile's header: the round picture beside the name and details, as tall
// as they are — a big block of details gets a big picture, a name alone a
// smaller one — so the two sides read as one balanced unit. The picture
// should be drawn at size="fill".
//
// The picture's column is a square the height of the row. A browser that
// can't size a column that way still gets a regular 56px circle, centred.
export function ProfileHead({ photo, children }: { photo: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
      {/* on a phone or tablet the details wrap onto more lines, and a picture
          as tall as them grew huge: there it stops at 80px, or 112px */}
      <div className="flex aspect-square h-full max-w-20 min-h-14 min-w-14 items-center md:max-w-28 lg:max-w-none">
        {/* contain: the picture's own pixel size mustn't widen the column */}
        <div className="aspect-square w-full [contain:size]">{photo}</div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
