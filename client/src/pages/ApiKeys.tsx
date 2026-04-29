import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Key, Copy, Eye, Loader2, Plus, RefreshCw, Trash2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ApiKeyRow {
	id: number;
	name: string;
	keyPrefix: string;
	createdAt: number;
	lastUsedAt: number;
	revokedAt: number;
	// true если plaintext был зашифрован при создании и сейчас доступен
	// для расшифровки через `/api/api-keys/:id/reveal`. false для ключей,
	// созданных до миграции add-api-key-encrypted — для них только rotate.
	revealable: boolean;
}

// Источник появления plaintext в модалке. Влияет на текст: «создан»,
// «открыт» или «перевыпущен» — пользователь должен понимать что
// произошло.
type SecretReveal = {
	name: string;
	secret: string;
	source: "created" | "revealed" | "rotated";
};

function formatTs(ts: number): string {
	if (!ts) return "—";
	return new Date(ts * 1000).toLocaleString("ru-RU");
}

export default function ApiKeysPage() {
	const [, setLocation] = useLocation();
	const { user, isLoading: authLoading } = useAuth();
	const { toast } = useToast();
	const queryClient = useQueryClient();

	const [newName, setNewName] = useState("");
	const [shownSecret, setShownSecret] = useState<SecretReveal | null>(null);

	const { data: keys = [], isLoading } = useQuery<ApiKeyRow[]>({
		queryKey: ["api-keys"],
		queryFn: async () => {
			const r = await fetch("/api/api-keys", { credentials: "include" });
			if (!r.ok) throw new Error("Не удалось загрузить ключи");
			return r.json();
		},
		enabled: !!user?.isAdmin,
	});

	const createMutation = useMutation({
		mutationFn: async (name: string) => {
			const r = await fetch("/api/api-keys", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			if (!r.ok) {
				const err = await r.json().catch(() => ({ message: "Ошибка" }));
				throw new Error(err.message || "Не удалось создать");
			}
			return r.json();
		},
		onSuccess: (data) => {
			setShownSecret({ name: data.name, secret: data.secret, source: "created" });
			setNewName("");
			queryClient.invalidateQueries({ queryKey: ["api-keys"] });
		},
		onError: (e: any) => {
			toast({ title: "Ошибка", description: e.message, variant: "destructive" });
		},
	});

	const revealMutation = useMutation({
		mutationFn: async (id: number) => {
			const r = await fetch(`/api/api-keys/${id}/reveal`, {
				method: "POST",
				credentials: "include",
			});
			const data = await r.json().catch(() => ({}));
			if (!r.ok) {
				throw new Error(data.message || "Не удалось показать ключ");
			}
			return data as { name: string; secret: string };
		},
		onSuccess: (data) => {
			setShownSecret({ name: data.name, secret: data.secret, source: "revealed" });
		},
		onError: (e: any) => {
			toast({ title: "Не получилось", description: e.message, variant: "destructive" });
		},
	});

	const rotateMutation = useMutation({
		mutationFn: async (id: number) => {
			const r = await fetch(`/api/api-keys/${id}/rotate`, {
				method: "POST",
				credentials: "include",
			});
			const data = await r.json().catch(() => ({}));
			if (!r.ok) {
				throw new Error(data.message || "Не удалось перевыпустить");
			}
			return data as { name: string; secret: string };
		},
		onSuccess: (data) => {
			setShownSecret({ name: data.name, secret: data.secret, source: "rotated" });
			queryClient.invalidateQueries({ queryKey: ["api-keys"] });
		},
		onError: (e: any) => {
			toast({ title: "Ошибка", description: e.message, variant: "destructive" });
		},
	});

	const revokeMutation = useMutation({
		mutationFn: async (id: number) => {
			const r = await fetch(`/api/api-keys/${id}`, {
				method: "DELETE",
				credentials: "include",
			});
			if (!r.ok) throw new Error("Не удалось отозвать");
			return r.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["api-keys"] });
			toast({ title: "Ключ отозван" });
		},
		onError: (e: any) => {
			toast({ title: "Ошибка", description: e.message, variant: "destructive" });
		},
	});

	const handleCopy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			toast({ title: "Скопировано", description: "Ключ в буфере обмена" });
		} catch {
			toast({ title: "Ошибка", description: "Не удалось скопировать", variant: "destructive" });
		}
	};

	if (authLoading) {
		return <div className="flex items-center justify-center min-h-screen">
			<Loader2 className="w-6 h-6 animate-spin" />
		</div>;
	}

	if (!user?.isAdmin) {
		return (
			<div className="flex items-center justify-center min-h-screen p-4">
				<div className="text-center">
					<p className="text-muted-foreground mb-4">Доступ только для администраторов</p>
					<Button onClick={() => setLocation("/dashboard")}>На главную</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="page-screen">
			<div className="page-container">
				<Button
					variant="ghost"
					onClick={() => setLocation("/admin/settings")}
					className="page-back"
				>
					<ArrowLeft className="w-4 h-4 mr-2" />
					Назад к настройкам
				</Button>

				<div className="page-header flex items-center gap-3">
					<Key className="w-8 h-8 text-primary" />
					<div>
						<h1 className="page-title">API ключи</h1>
						<p className="page-subtitle">
							Ключи TasksFlow для интеграций. Тот же tfk_ ключ можно указать в WeSetup.
						</p>
					</div>
				</div>

				<div className="content-panel mb-6">
					<h2 className="font-semibold mb-3">Создать новый ключ</h2>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Input
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							placeholder="Название ключа"
							maxLength={100}
							className="min-w-0"
							onKeyDown={(e) => {
								if (e.key === "Enter" && newName.trim() && !createMutation.isPending) {
									createMutation.mutate(newName.trim());
								}
							}}
						/>
						<Button
							onClick={() => createMutation.mutate(newName.trim())}
							disabled={!newName.trim() || createMutation.isPending}
							className="w-full sm:w-auto"
						>
							{createMutation.isPending
								? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
								: <Plus className="w-4 h-4 mr-2" />}
							Создать
						</Button>
					</div>
				</div>

				<div className="content-panel overflow-hidden !p-0">
					<div className="p-4 border-b">
						<h2 className="font-semibold">Ключи ({keys.length})</h2>
					</div>

					{isLoading ? (
						<div className="p-8 text-center">
							<Loader2 className="w-6 h-6 animate-spin mx-auto" />
						</div>
					) : keys.length === 0 ? (
						<div className="p-8 text-center text-muted-foreground">
							Ключей пока нет
						</div>
					) : (
						<div className="divide-y">
							{keys.map((k) => (
								<div key={k.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2 mb-1">
											<span className="font-medium">{k.name}</span>
											{k.revokedAt ? (
												<span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
													отозван
												</span>
											) : (
												<span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400">
													активен
												</span>
											)}
										</div>
										<div className="text-xs text-muted-foreground font-mono">
											{k.keyPrefix}...
										</div>
										<div className="text-xs text-muted-foreground mt-1">
											Создан {formatTs(k.createdAt)} · Использован {formatTs(k.lastUsedAt)}
										</div>
									</div>
									{!k.revokedAt && (
										<div className="flex flex-col gap-2 sm:flex-row">
											{k.revealable && (
												<Button
													variant="outline"
													size="sm"
													className="w-full sm:w-auto"
													onClick={() => revealMutation.mutate(k.id)}
													disabled={revealMutation.isPending}
													title="Расшифровать и показать plaintext"
												>
													<Eye className="w-4 h-4 mr-2" />
													Показать
												</Button>
											)}
											<Button
												variant="outline"
												size="sm"
												className="w-full sm:w-auto"
												onClick={() => {
													if (
														confirm(
															`Перевыпустить ключ «${k.name}»?\n\n` +
																`Старый ключ будет отозван прямо сейчас, ` +
																`получите новый plaintext в окне после.`,
														)
													) {
														rotateMutation.mutate(k.id);
													}
												}}
												disabled={rotateMutation.isPending}
												title="Отозвать и выдать новый plaintext"
											>
												<RefreshCw className="w-4 h-4 mr-2" />
												Перевыпустить
											</Button>
											<Button
												variant="outline"
												size="sm"
												className="w-full sm:w-auto"
												onClick={() => {
													if (confirm(`Отозвать ключ «${k.name}»?\n\nВсе интеграции с ним сразу перестанут работать.`)) {
														revokeMutation.mutate(k.id);
													}
												}}
												disabled={revokeMutation.isPending}
											>
												<Trash2 className="w-4 h-4 mr-2" />
												Отозвать
											</Button>
										</div>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{shownSecret && (
				<div
					className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
					onClick={() => setShownSecret(null)}
				>
					<div
						className="content-panel max-w-lg w-full"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex items-center gap-2 mb-3">
							{shownSecret.source === "revealed" ? (
								<Eye className="w-5 h-5 text-primary" />
							) : shownSecret.source === "rotated" ? (
								<RefreshCw className="w-5 h-5 text-primary" />
							) : (
								<CheckCircle2 className="w-5 h-5 text-green-600" />
							)}
							<h3 className="font-semibold text-lg">
								{shownSecret.source === "revealed"
									? `Ключ «${shownSecret.name}»`
									: shownSecret.source === "rotated"
									? "Ключ перевыпущен"
									: "Ключ создан"}
							</h3>
						</div>
						<p className="text-sm text-muted-foreground mb-4">
							{shownSecret.source === "revealed"
								? "Plaintext восстановлен из шифрованной копии в БД. Скопируйте и закройте окно — окно само не закроется."
								: shownSecret.source === "rotated"
								? "Старый ключ отозван — все интеграции на нём сразу перестанут работать. Скопируйте новый plaintext и пропишите его в интеграциях."
								: "Сохраните ключ в надёжном месте. Через «Показать» можно будет открыть его повторно, пока не отозвали."}
						</p>
						<div className="bg-muted rounded p-3 font-mono text-sm break-all mb-4">
							{shownSecret.secret}
						</div>
						<div className="flex flex-col gap-2 justify-end sm:flex-row">
							<Button variant="outline" onClick={() => handleCopy(shownSecret.secret)}>
								<Copy className="w-4 h-4 mr-2" />
								Копировать
							</Button>
							<Button onClick={() => setShownSecret(null)}>Готово</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
