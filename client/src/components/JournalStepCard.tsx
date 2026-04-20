import type { ReactNode } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type JournalStepCardProps = {
  step: string;
  title: string;
  summary?: string | null;
  description?: string | null;
  open: boolean;
  done?: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function JournalStepCard({
  step,
  title,
  summary,
  description,
  open,
  done = false,
  onToggle,
  children,
}: JournalStepCardProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/50 bg-card/70">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/20"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                done
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 bg-background text-muted-foreground"
              )}
            >
              {done ? <CheckCircle2 className="h-4 w-4" /> : step}
            </span>
            <div className="min-w-0">
              <div className="font-medium">{title}</div>
              {summary ? (
                <div className="truncate text-sm text-muted-foreground">
                  {summary}
                </div>
              ) : description ? (
                <div className="truncate text-sm text-muted-foreground">
                  {description}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open ? "rotate-180" : ""
          )}
        />
      </button>

      {open ? <div className="border-t border-border/50 p-4">{children}</div> : null}
    </section>
  );
}
