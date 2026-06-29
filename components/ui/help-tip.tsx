/**
 * HelpTip — small inline (?) icon with a browser-native tooltip.
 * Pure server component (no JS needed). Hover over the icon to see the explanation.
 */
export function HelpTip({ tip }: { tip: string }) {
  return (
    <span
      title={tip}
      aria-label={tip}
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-[10px] font-bold text-slate-500 hover:bg-slate-200"
    >
      ?
    </span>
  );
}
