import { useEffect, useMemo, useState } from "react";
import { Link, Redirect } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { ArrowLeft, Copy, Printer, QrCode } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { canManageQuickLogin, QUICK_LOGIN_PATH, type QuickLoginLink } from "@shared/quick-login";
import { printQuickLogin, quickLoginPrintHtml, type QuickLoginPrintFormat } from "@/lib/quick-login-print";
import { PageSkeleton } from "@/components/PageSkeleton";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { isDemo } from "@/demo/demo-mode";

export default function QuickLoginPrint() {
  const { user, isLoading } = useAuth();
  const { access } = usePermissions();
  const allowed = !!access && canManageQuickLogin(access);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [format, setFormat] = useState<QuickLoginPrintFormat>("a4");
  const [qr, setQr] = useState("");
  const [qrError, setQrError] = useState(false);
  const [qrAttempt, setQrAttempt] = useState(0);
  const [printing, setPrinting] = useState(false);
  const queryKey = [QUICK_LOGIN_PATH, "link", user?.id];
  const link = useQuery<QuickLoginLink>({
    queryKey,
    queryFn: async () => (await apiRequest("GET", `${QUICK_LOGIN_PATH}/link`)).json(),
    enabled: allowed,
  });
  const create = useMutation({
    mutationFn: async (): Promise<QuickLoginLink> => (await apiRequest("POST", `${QUICK_LOGIN_PATH}/link`)).json(),
    onSuccess: (data) => qc.setQueryData(queryKey, data),
  });
  const url = link.data?.url;
  useEffect(() => {
    let active = true;
    setQr("");
    setQrError(false);
    if (url) {
      QRCode.toDataURL(url, { width: 1200, margin: 4, errorCorrectionLevel: "M" })
        .then((data) => { if (active) setQr(data); })
        .catch(() => { if (active) setQrError(true); });
    }
    return () => { active = false; };
  }, [url, qrAttempt]);
  const html = useMemo(() => qr && url && link.data
    ? quickLoginPrintHtml(link.data.companyName, url, qr, format) : "", [qr, url, link.data, format]);

  if (isLoading) return <PageSkeleton />;
  if (!user) return <Redirect to="/login" />;
  if (!allowed) return <Redirect to="/dashboard" />;

  const print = async () => {
    setPrinting(true);
    try { await printQuickLogin(html); }
    catch { toast({ title: "Не удалось открыть печать", description: "Повторите попытку в браузере.", variant: "destructive" }); }
    finally { setPrinting(false); }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url!);
      toast({ title: "Ссылка скопирована" });
    } catch { toast({ title: "Не удалось скопировать ссылку", variant: "destructive" }); }
  };

  return <div className="page-screen"><div className="page-container page-container--narrow">
    <Link href="/dashboard" data-home-back className="page-back group"><ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />Назад</Link>
    <div className="page-header"><div className="page-title-row">
      <div className="page-icon"><QrCode className="h-6 w-6" /></div>
      <div className="min-w-0"><h1 className="page-title">QR-код для входа</h1>
        <p className="page-subtitle">Разместите на производстве: сотрудник выберет себя, введёт PIN и откроет свои задачи.</p>
      </div>
    </div></div>
    <section className="content-panel space-y-6" aria-label="Печать QR-кода">
      {link.isPending ? <PageSkeleton /> : link.isError && !link.data
        ? <QueryError message="Не удалось загрузить QR-код." onRetry={() => { void link.refetch(); }} />
        : <>
          <h2 className="text-lg font-semibold break-words">{link.data?.companyName}</h2>
          {isDemo() && <p className="text-sm text-muted-foreground">Это образец для демо. В вашей организации будет своя постоянная ссылка.</p>}
          {!url ? <>
            <p className="text-sm text-muted-foreground">Один QR-код для всех сотрудников. Ссылка действует постоянно; для входа каждому нужен свой PIN.</p>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Создаём QR-код…" : "Создать QR-код входа"}</Button>
            {create.isError && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}
          </> : <>
            <fieldset className="flex flex-wrap gap-x-5" aria-label="Формат печати">
              <Label className="flex min-h-11 items-center gap-2 cursor-pointer"><input type="radio" name="print-format" value="a4" checked={format === "a4"} onChange={() => setFormat("a4")} className="h-4 w-4 accent-primary" />Лист А4</Label>
              <Label className="flex min-h-11 items-center gap-2 cursor-pointer"><input type="radio" name="print-format" value="label" checked={format === "label"} onChange={() => setFormat("label")} className="h-4 w-4 accent-primary" />Стикер 58 × 40 мм</Label>
            </fieldset>
            {qrError ? <QueryError message="Не удалось подготовить изображение QR-кода." onRetry={() => setQrAttempt((v) => v + 1)} />
              : !html ? <PageSkeleton /> : <iframe title="Предпросмотр распечатки" srcDoc={html} sandbox="allow-same-origin" className="block mx-auto w-full max-w-sm border rounded-lg bg-white" style={{ aspectRatio: format === "a4" ? "210 / 297" : "58 / 40" }} />}
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => { void print(); }} disabled={!html || printing}><Printer className="h-4 w-4" />{printing ? "Подготовка…" : "Печатать"}</Button>
              <Button variant="outline" onClick={() => { void copy(); }}><Copy className="h-4 w-4" />Копировать ссылку</Button>
            </div>
            <p className="text-sm text-muted-foreground">{format === "a4" ? "В окне печати выберите бумагу А4." : "В настройках принтера выберите этикетку 58 × 40 мм и масштаб 100%."} Отключите колонтитулы. Можно сохранить в PDF.</p>
            <p className="text-sm text-muted-foreground">По QR-коду видны имена и должности сотрудников. Размещайте его внутри организации. Если у сотрудника ещё нет PIN, администратор может задать его в разделе «Сотрудники».</p>
          </>}
        </>}
    </section>
  </div></div>;
}
