import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RectangleEllipsis } from "lucide-react";
import { pinProblem } from "@shared/pin";
import { api } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { PinInput } from "@/components/PinInput";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { postAuthJson } from "@/lib/auth-api";

type Step = "idle" | "current" | "new" | "confirm";

const STEP_LABEL: Record<Exclude<Step, "idle">, string> = {
  current: "Текущий PIN",
  new: "Новый PIN",
  confirm: "Повторите новый PIN",
};

/**
 * «PIN для входа» в аккаунте: текущий → новый → повтор, каждый шаг сам
 * переходит дальше после четвёртой цифры. После входа по email текущий
 * PIN не спрашиваем — так восстанавливают забытый.
 */
export function ChangePinCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("idle");
  const [value, setValue] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const hasPin = !!user.hasPin;
  const needsCurrent = hasPin && !user.pinResetByEmail;

  const fail = (message: string, nextStep: Step) => {
    setError(message);
    setErrorKey((k) => k + 1);
    setValue("");
    setStep(nextStep);
  };

  const start = () => {
    setError(null);
    setValue("");
    setCurrentPin("");
    setNewPin("");
    setStep(needsCurrent ? "current" : "new");
  };

  const save = async (confirmed: string) => {
    setBusy(true);
    const { ok, data } = await postAuthJson("/api/auth/pin", {
      ...(needsCurrent ? { currentPin } : {}),
      newPin: confirmed,
    });
    setBusy(false);
    if (ok) {
      await queryClient.invalidateQueries({ queryKey: [api.auth.me.path] });
      toast({ title: "PIN изменён" });
      setStep("idle");
      setValue("");
      return;
    }
    const message = typeof data.message === "string" ? data.message : "Не удалось сменить PIN";
    const left = typeof data.attemptsLeft === "number" ? ` Осталось попыток: ${data.attemptsLeft}.` : "";
    if (data.field === "currentPin") fail(message + left, "current");
    else fail(message, "new");
  };

  const onComplete = (pin: string) => {
    setError(null);
    if (step === "current") {
      setCurrentPin(pin);
      setValue("");
      setStep("new");
    } else if (step === "new") {
      const problem = pinProblem(pin);
      if (problem) return fail(problem, "new");
      setNewPin(pin);
      setValue("");
      setStep("confirm");
    } else if (step === "confirm") {
      if (pin !== newPin) return fail("PIN не совпал — придумайте заново", "new");
      void save(pin);
    }
  };

  return (
    <section className="content-panel account-section" aria-labelledby="change-pin-title">
      <div className="section-title">
        <RectangleEllipsis className="w-5 h-5 text-primary" aria-hidden="true" />
        <h2 id="change-pin-title">PIN для входа</h2>
      </div>

      {step === "idle" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {hasPin
              ? "Вход по номеру телефона защищён PIN из 4 цифр."
              : "PIN не задан — его спросят при следующем входе по номеру."}
          </p>
          <Button type="button" variant="outline" onClick={start}>
            {hasPin ? "Сменить PIN" : "Задать PIN"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3 text-center">
          <p className="text-sm font-medium" id="change-pin-label">
            {STEP_LABEL[step]}
          </p>
          <PinInput
            key={step}
            value={value}
            onChange={(next) => {
              setValue(next);
              if (error) setError(null);
            }}
            onComplete={onComplete}
            label={STEP_LABEL[step]}
            autoFocus
            disabled={busy}
            errorKey={errorKey}
            invalid={!!error}
            describedBy={error ? "change-pin-error" : undefined}
          />
          <p id="change-pin-error" className="min-h-5 text-sm text-destructive" aria-live="polite">
            {error}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep("idle")} disabled={busy}>
            Отмена
          </Button>
        </div>
      )}
    </section>
  );
}
