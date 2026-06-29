import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-6">
      <div>
        <Skeleton className="h-7 w-72" />
        <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <CardSkeleton key={index} rows={2} />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="grid gap-4">
          <CardSkeleton rows={4} />
          <CardSkeleton rows={5} />
        </div>
        <div className="grid content-start gap-4">
          <CardSkeleton rows={3} />
          <CardSkeleton rows={5} />
        </div>
      </div>
    </div>
  );
}
