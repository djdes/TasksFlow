"use client";

import { type ComponentProps, type MouseEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = ComponentProps<typeof Button> & {
  documentId: string;
  title: string;
  confirmMessage?: string;
  successMessage?: string;
  onClosed?: () => void;
};

export function DocumentCloseButton({
  documentId,
  title,
  confirmMessage,
  successMessage = "Журнал закрыт",
  onClosed,
  children,
  onClick,
  disabled,
  ...buttonProps
}: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented || disabled || isSubmitting) {
      return;
    }

    const message = confirmMessage || `Закончить журнал "${title}"?`;
    if (!window.confirm(message)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || "Не удалось закрыть журнал");
      }

      onClosed?.();
      toast.success(successMessage);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось закрыть журнал");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Button
      type="button"
      disabled={disabled || isSubmitting}
      onClick={handleClick}
      {...buttonProps}
    >
      {isSubmitting ? "Закрытие..." : children || "Закончить журнал"}
    </Button>
  );
}
