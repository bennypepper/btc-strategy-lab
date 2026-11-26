"use client";

import { useId, useState } from "react";
import { HelpCircle } from "lucide-react";

export interface TooltipProps {
  content: string;
  children?: React.ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className = "" }: TooltipProps) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-describedby={open ? tooltipId : undefined}
        aria-label={content}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="inline-flex cursor-help items-center justify-center border-0 bg-transparent p-0 text-[#547792] hover:text-[#0a7c6e] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a7c6e]"
      >
        {children ?? <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>

      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 border border-[#213448] bg-[#213448] px-3 py-2 text-center font-label text-xs font-normal leading-snug text-white shadow-[3px_3px_0px_0px_rgba(33,52,72,0.22)]"
        >
          {content}
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-full -ml-[5px] border-[5px] border-transparent border-t-[#213448]"
          />
        </span>
      )}
    </span>
  );
}
