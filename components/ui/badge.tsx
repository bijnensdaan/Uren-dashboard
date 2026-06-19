import { cn } from "@/lib/utils";

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-1 text-xs font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}
