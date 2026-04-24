import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Key, Copy, Loader2, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ApiKeyRow {
	id: number;
	name: string;
	keyPrefix: string;
	createdAt: number;
	lastUsedAt: number;
	revokedAt: number;
}

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
	const [justCreated, setJustCreated] = useState<{ name: string; secret: string } | null>(null);

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
			setJustCreated({ name: data.name, secret: data.secret });
			setNewName("");
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
		<div className="min-h-screen bg-background p-4 md:p-8">
			<div className="max-w-4xl mx-auto">
				<Button
					variant="ghost"
					onClick={() => setLocation("/admin/settings")}
					className="mb-4"
				>
					<ArrowLeft className="w-4 h-4 mr-2" />
					Назад к настройкам
				</Button>

				<div className="flex items-center gap-3 mb-6">
					<Key className="w-8 h-8 text-primary" />
					<div>
						<h1 className="text-2xl font-bold">API ключи</h1>
						<p className="text-sm text-muted-foreground">
							Для интеграций со сторонними сервисами (managermagday и др.)
						</p>
					</div>
				</div>

				<div className="bg-card border rounded-lg p-4 mb-6">
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

				<div className="bg-card border rounded-lg overflow-hidden">
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
									)}
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{justCreated && (
				<div
					className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
					onClick={() => setJustCreated(null)}
				>
					<div
						className="bg-background border rounded-lg p-6 max-w-lg w-full"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex items-center gap-2 mb-3">
							<CheckCircle2 className="w-5 h-5 text-green-600" />
							<h3 className="font-semibold text-lg">Ключ создан</h3>
						</div>
						<p className="text-sm text-muted-foreground mb-4">
							Этот ключ показывается <strong>только один раз</strong>. Сохрани его сейчас — потом получить снова нельзя.
						</p>
						<div className="bg-muted rounded p-3 font-mono text-sm break-all mb-4">
							{justCreated.secret}
						</div>
						<div className="flex gap-2 justify-end">
							<Button variant="outline" onClick={() => handleCopy(justCreated.secret)}>
								<Copy className="w-4 h-4 mr-2" />
								Копировать
							</Button>
							<Button onClick={() => setJustCreated(null)}>Готово</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
