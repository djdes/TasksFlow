"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StickyActionBarProps = {
  children: ReactNode;
  className?: string;
};

export function StickyActionBar({ children, className }: StickyActionBarProps) {
  return (
    <div
      className={cn(
        "sticky top-14 z-20 -mx-4 mb-6 flex flex-wrap items-center gap-3 border-b border-[#dcdfed] bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6",
        className
      )}
    >
      {children}
    </div>
  );
}
