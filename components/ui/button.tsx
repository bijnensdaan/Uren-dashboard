import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold transition",
        "focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2",
        variant === "primary" && "bg-[var(--primary)] text-white hover:bg-[var(--primary-strong)]",
        variant === "secondary" && "border border-[var(--border)] bg-white text-slate-800 hover:bg-slate-50",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        className,
      )}
      {...props}
    />
  );
}
