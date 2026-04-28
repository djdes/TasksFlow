import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, QrCode, Copy, Trash2, Share2, Download, ChevronDown, ChevronUp } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import QRCode from "qrcode";
import type { Invitation } from "@shared/schema";

type CreatedInvite = {
  id: number;
  token: string;
  url: string;
  position: string | null;
  isAdmin: boolean;
  createdAt: number;
};

type Role = "employee" | "manager" | "admin";

export default function Invitations() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [showQrFor, setShowQrFor] = useState<{ url: string; token: string } | null>(null);
  const [position, setPosition] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) setLocation("/dashboard");
  }, [user, authLoading, setLocation]);

  const activeQuery = useQuery<Invitation[]>({
    queryKey: ["invitations", "active"],
    queryFn: async () => {
      const r = await fetch("/api/invitations", { credentials: "include" });
      if (!r.ok) throw new Error("Не удалось загрузить");
      return r.json();
    },
    enabled: !!user?.isAdmin,
  });

  const allQuery = useQuery<Invitation[]>({
    queryKey: ["invitations", "all"],
    queryFn: async () => {
      const r = await fetch("/api/invitations?includeAll=true", { credentials: "include" });
      if (!r.ok) throw new Error("Не удалось загрузить");
      return r.json();
    },
    enabled: showHistory && !!user?.isAdmin,
  });

  const createMutation = useMutation<CreatedInvite, Error, void>({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (position.trim()) body.position = position.trim();
      if (role !== "employee") body.role = role;
      const r = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).message || "Ошибка");
      return r.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      setShowCreate(false);
      setPosition("");
      setRole("employee");
      setShowQrFor({ url: created.url, token: created.token });
    },
    onError: (e) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const r = await fetch(`/api/invitations/${id}/revoke`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json()).message || "Ошибка");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast({ title: "Приглашение отозвано" });
    },
    onError: (e) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  if (authLoading || !user?.isAdmin) return null;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Скопировано" });
    } catch {
      toast({ title: "Не удалось скопировать", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation("/dashboard")} aria-label="Назад">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold">Приглашения</h1>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-6">
        <p className="text-sm text-muted-foreground">
          Сгенерируйте QR-код или ссылку и отправьте сотруднику. Он сам введёт
          имя и телефон, после чего попадёт в кабинет вашей компании.
        </p>

        <Button onClick={() => setShowCreate(true)} className="w-full h-14 text-base">
          <QrCode className="w-5 h-5 mr-2" />
          Сгенерировать QR
        </Button>

        <section className="space-y-2">
          <h2 className="font-semibold">Активные приглашения</h2>
          {activeQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          )}
          {activeQuery.data && activeQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Пока нет активных приглашений.
            </p>
          )}
          {activeQuery.data?.map((inv) => (
            <div
              key={inv.id}
              className="p-3 border border-border rounded-xl flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  {inv.position || "Без должности"} ·{" "}
                  {inv.isAdmin ? "Админ/менеджер" : "Сотрудник"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Создано: {new Date(inv.createdAt * 1000).toLocaleString("ru-RU")}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const url = `${window.location.origin}/join/${inv.token}`;
                    setShowQrFor({ url, token: inv.token });
                  }}
                  aria-label="Показать QR"
                >
                  <QrCode className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    copyToClipboard(`${window.location.origin}/join/${inv.token}`)
                  }
                  aria-label="Скопировать ссылку"
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm("Отозвать приглашение?"))
                      revokeMutation.mutate(inv.id);
                  }}
                  aria-label="Отозвать"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </section>

        <section>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition"
          >
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showHistory ? "Скрыть историю" : "Показать историю"}
          </button>
          {showHistory && (
            <div className="mt-2">
              {allQuery.isFetching && (
                <p className="text-sm text-muted-foreground">Загрузка...</p>
              )}
              {allQuery.data
                ?.filter((i) => i.usedAt || i.revokedAt)
                .map((inv) => (
                  <div
                    key={inv.id}
                    className="p-2 text-sm text-muted-foreground border-b border-border last:border-0"
                  >
                    {inv.usedAt ? "✓ Принято" : "✗ Отозвано"} ·{" "}
                    {inv.position || "без должности"} ·{" "}
                    {new Date(
                      (inv.usedAt || inv.revokedAt || 0) * 1000,
                    ).toLocaleString("ru-RU")}
                  </div>
                ))}
            </div>
          )}
        </section>
      </main>

      {/* Модалка создания */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новое приглашение</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="inv-position">Должность (необязательно)</Label>
              <Input
                id="inv-position"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="Например, Кассир"
              />
            </div>
            <div className="space-y-2">
              <Label>Роль</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Сотрудник</SelectItem>
                  <SelectItem value="manager">Менеджер</SelectItem>
                  <SelectItem value="admin">Админ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              Отмена
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Создание..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Модалка с QR */}
      <Dialog
        open={!!showQrFor}
        onOpenChange={(open) => !open && setShowQrFor(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR-код приглашения</DialogTitle>
          </DialogHeader>
          {showQrFor && <QrPanel url={showQrFor.url} onCopy={copyToClipboard} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QrPanel({ url, onCopy }: { url: string; onCopy: (s: string) => void }) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 1 }).then(setDataUrl);
  }, [url]);

  const share = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ url, title: "Приглашение в TasksFlow" });
      } catch {
        /* пользователь отменил */
      }
    } else {
      onCopy(url);
    }
  };

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "invitation-qr.png";
    a.click();
  };

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="space-y-3 flex flex-col items-center">
      {dataUrl ? (
        <img src={dataUrl} alt="QR" className="w-64 h-64" />
      ) : (
        <div className="w-64 h-64 bg-muted animate-pulse rounded" />
      )}
      <div className="text-xs font-mono break-all text-center px-2">{url}</div>
      <div className="flex gap-2 flex-wrap justify-center">
        <Button size="sm" variant="outline" onClick={() => onCopy(url)}>
          <Copy className="w-4 h-4 mr-1" />
          Скопировать
        </Button>
        {canShare && (
          <Button size="sm" variant="outline" onClick={share}>
            <Share2 className="w-4 h-4 mr-1" />
            Поделиться
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="w-4 h-4 mr-1" />
          Скачать
        </Button>
      </div>
    </div>
  );
}
