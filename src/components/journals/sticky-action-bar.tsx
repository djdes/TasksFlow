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
        "sticky top-0 z-30 -mx-6 mb-6 flex flex-wrap items-center gap-3 border-b border-[#dcdfed] bg-white/95 px-6 py-3 backdrop-blur",
        className
      )}
    >
      {children}
    </div>
  );
}
