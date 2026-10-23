/**
 * ВРЕМЕННО: минимальная версия до слияния с веткой публичной части, где
 * лежит финальный компонент с тем же API ({ checked, onChange, id, compact, error }).
 */
type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  compact?: boolean;
  error?: string | null;
};

export function LegalConsent({ checked, onChange, id = "legal-consent", error }: Props) {
  return (
    <div>
      <label htmlFor={id} className="flex items-start gap-2.5 text-sm text-muted-foreground">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
        <span>
          Согласен на <a href="/consent" className="text-primary underline-offset-2 hover:underline">обработку персональных данных</a> и с <a href="/privacy" className="text-primary underline-offset-2 hover:underline">политикой</a>
        </span>
      </label>
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
