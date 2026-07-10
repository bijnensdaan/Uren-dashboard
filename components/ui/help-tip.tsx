/**
 * HelpTip — small inline (?) icon with a CSS tooltip.
 * Pure server component (no JS needed). The tooltip opens on hover AND on
 * focus/click (via tabIndex), so it also works on touchscreens and with het
 * toetsenbord — het native title-attribuut deed dat niet.
 */
export function HelpTip({ tip }: { tip: string }) {
  return (
    <span className="group/tip relative ml-1 inline-flex">
      <span
        tabIndex={0}
        role="button"
        aria-label={tip}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-[10px] font-bold text-slate-500 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-300"
      >
        ?
      </span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-full z-50 mt-1.5 w-64 -translate-x-1/2 whitespace-normal rounded border border-slate-700 bg-slate-900 px-2.5 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-white opacity-0 shadow-lg transition-opacity duration-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100 group-hover/tip:visible group-hover/tip:opacity-100"
      >
        {tip}
      </span>
    </span>
  );
}
