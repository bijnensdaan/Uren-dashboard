import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded border border-[var(--border)] bg-white p-4 shadow-sm", className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
