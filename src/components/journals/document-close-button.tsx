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

const CLOSE_LABEL = "\u0417\u0430\u043a\u043e\u043d\u0447\u0438\u0442\u044c \u0436\u0443\u0440\u043d\u0430\u043b";
const CLOSING_LABEL = "\u0417\u0430\u043a\u0440\u044b\u0442\u0438\u0435...";
const CLOSED_TOAST = "\u0416\u0443\u0440\u043d\u0430\u043b \u0437\u0430\u043a\u0440\u044b\u0442";
const CLOSE_ERROR =
  "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u043a\u0440\u044b\u0442\u044c \u0436\u0443\u0440\u043d\u0430\u043b";

export function DocumentCloseButton({
  documentId,
  title,
  confirmMessage,
  successMessage = CLOSED_TOAST,
  onClosed,
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

    const message =
      confirmMessage || `${CLOSE_LABEL} "${title}"?`;
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
        throw new Error(result?.error || CLOSE_ERROR);
      }

      onClosed?.();
      toast.success(successMessage);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : CLOSE_ERROR);
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
      {isSubmitting ? CLOSING_LABEL : CLOSE_LABEL}
    </Button>
  );
}
