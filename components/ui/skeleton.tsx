import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-slate-200", className)} />;
}

export function SkeletonLines({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn(
            "h-3",
            index === lines - 1 ? "w-2/3" : "w-full",
          )}
        />
      ))}
    </div>
  );
}

export function CardSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("rounded border border-[var(--border)] bg-white p-4 shadow-sm", className)}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <SkeletonLines lines={rows} />
    </div>
  );
}
