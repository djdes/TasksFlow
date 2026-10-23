import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { generatePin, pinProblem } from "@shared/pin";
import { api } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { AdminPinField } from "@/components/AdminPinField";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type PinUser = {
  id: number;
  phone?: string | null;
  name?: string | null;
  hasPin?: boolean;
};

/** Текст, который руководитель пересылает сотруднику. */
function shareText(phone: string | null | undefined, pin: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return [`Вход в TasksFlow: ${origin}/login`, phone ? `Номер: ${phone}` : null, `PIN: ${pin}`]
    .filter(Boolean)
    .join("\n");
}

/**
 * «PIN 4826 — сообщите сотруднику» с копированием готового текста для
 * мессенджера. Показывается один раз: сервер хранит только хэш.
 */
export function PinShareNote({ phone, pin, onDone }: { phone?: string | null; pin: string; onDone?: () => void }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText(phone, pin));
      setCopied(true);
    } catch {
      toast({ title: "Не удалось скопировать", description: "Перепишите PIN вручную", variant: "destructive" });
    }
  };

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3" role="status">
      <p className="text-sm text-foreground">
        PIN <span className="font-mono text-base font-semibold tracking-[0.2em]">{pin}</span> — сообщите его сотруднику.
        Позже его не будет видно.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="mr-1.5 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />}
          {copied ? "Скопировано" : "Скопировать для мессенджера"}
        </Button>
        {onDone && (
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Готово
          </Button>
        )}
      </div>
    </div>
  );
}

/** Новый PIN сотруднику или сброс — сотрудник придумает PIN сам при входе. */
export function UserPinPanel({ user, onClose }: { user: PinUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pin, setPin] = useState(() => generatePin());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const errorId = `user-pin-error-${user.id}`;

  const refresh = () => queryClient.invalidateQueries({ queryKey: [api.users.list.path] });

  const setPinMutation = useMutation({
    mutationFn: (value: string) => apiRequest("POST", `/api/users/${user.id}/pin`, { pin: value }),
    onSuccess: async (_res, value) => {
      setSaved(value);
      await refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/users/${user.id}/pin`),
    onSuccess: async () => {
      await refresh();
      toast({ title: "PIN сброшен", description: "Сотрудник придумает новый при входе" });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const busy = setPinMutation.isPending || clearMutation.isPending;

  if (saved) return <PinShareNote phone={user.phone} pin={saved} onDone={onClose} />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = pinProblem(pin);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setPinMutation.mutate(pin);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor={`user-pin-${user.id}`} className="block text-xs text-muted-foreground">
        Новый PIN для входа
      </label>
      <AdminPinField
        id={`user-pin-${user.id}`}
        value={pin}
        onChange={(value) => {
          setPin(value);
          setError(null);
        }}
        disabled={busy}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        autoFocus
      />
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {user.hasPin ? (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
            onClick={() => clearMutation.mutate()}
            disabled={busy}
          >
            Сбросить — придумает сам при входе
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {setPinMutation.isPending ? "Сохранение..." : "Сохранить PIN"}
          </Button>
        </div>
      </div>
    </form>
  );
}
