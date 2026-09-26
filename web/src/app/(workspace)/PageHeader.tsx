// Every page opens the same way: what it is, one line on what it's for, and
// its own actions on the right. Someone landing anywhere for the first time
// should know where they are and what the page is for without clicking
// anything to find out.
export function PageHeader({
  title,
  description,
  actions,
  className = "mb-6",
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  // its space below — none where the page already spaces its sections
  className?: string;
}) {
  return (
    <header className={`flex ${className} flex-wrap items-end justify-between gap-x-6 gap-y-3`}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
