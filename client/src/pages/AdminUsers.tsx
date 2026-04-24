import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, UserPlus, Users, Coins, RotateCcw, Pencil, X, Check, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { insertUserSchema, updateUserSchema } from "@shared/schema";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

const formSchema = insertUserSchema.pick({ phone: true, name: true });
const editFormSchema = updateUserSchema;

type FormValues = z.infer<typeof formSchema>;
type EditFormValues = z.infer<typeof editFormSchema>;

export default function AdminUsers() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [editName, setEditName] = useState("");

  // Получаем список пользователей (хук должен быть до early return)
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const response = await fetch(api.users.list.path, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }
      return response.json();
    },
    enabled: !!user?.isAdmin,
  });

  // Мутация для создания пользователя
  const createUserMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const response = await fetch(api.users.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create user");
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      form.reset({ phone: "+7", name: "" });
      toast({ title: "Пользователь создан" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  // Мутация для обновления пользователя
  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: EditFormValues }) => {
      const response = await fetch(buildUrl(api.users.update.path, { id }), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update user");
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditingUserId(null);
      toast({ title: "Пользователь обновлён" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  // Мутация для сброса баланса
  const resetBalanceMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetch(`/api/users/${userId}/reset-balance`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to reset balance");
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Баланс сброшен" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  // Мутация для удаления пользователя
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete user");
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Пользователь удалён" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      phone: "+7",
      name: "",
    },
  });

  const onSubmit = (values: FormValues) => {
    createUserMutation.mutate(values);
  };

  // Проверка загрузки авторизации
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-muted-foreground">Загрузка...</span>
        </div>
      </div>
    );
  }

  // Проверка прав администратора
  if (!user || !user.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Доступ запрещен</h1>
          <p className="text-muted-foreground mb-4">Требуются права администратора</p>
          <Button onClick={() => setLocation("/")}>На главную</Button>
        </div>
      </div>
    );
  }

  const startEditing = (u: any) => {
    setEditingUserId(u.id);
    setEditPhone(u.phone);
    setEditName(u.name || "");
  };

  const cancelEditing = () => {
    setEditingUserId(null);
    setEditPhone("");
    setEditName("");
  };

  const saveEditing = () => {
    if (editingUserId === null) return;
    updateUserMutation.mutate({
      id: editingUserId,
      data: { phone: editPhone, name: editName || null },
    });
  };

  return (
    <div className="page-screen">
      <div className="page-container">
        <div className="page-header">
          <button
            onClick={() => setLocation("/")}
            className="page-back group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Назад
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="page-icon">
              <Users className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="page-title">Управление пользователями</h1>
          </div>
          <p className="page-subtitle sm:ml-[60px]">Добавьте новых пользователей в систему</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Форма добавления пользователя */}
          <div className="content-panel">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Добавить пользователя
            </h2>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Номер телефона</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="xxx xxx xx xx"
                          className="things-input"
                          value={field.value}
                          onChange={(e) => {
                            let value = e.target.value;
                            // Убираем +7 в начале если есть
                            let cleaned = value.replace(/^\+?7?/, "");
                            // Оставляем только цифры
                            let digits = cleaned.replace(/\D/g, "");
                            // Если первая цифра 7 (ввод начали с 7 или вставили номер типа 79991234567)
                            if (digits.startsWith("7") && digits.length > 1) {
                              digits = digits.slice(1);
                            }
                            // Ограничиваем до 10 цифр
                            const limitedDigits = digits.slice(0, 10);
                            field.onChange("+7" + limitedDigits);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Backspace") {
                              const cursorPos = (e.target as HTMLInputElement).selectionStart || 0;
                              if (cursorPos <= 2) {
                                e.preventDefault();
                                return;
                              }
                            }
                            if (e.key === "Delete") {
                              const cursorPos = (e.target as HTMLInputElement).selectionStart || 0;
                              if (cursorPos < 2) {
                                e.preventDefault();
                                return;
                              }
                            }
                          }}
                          onFocus={(e) => {
                            if (field.value === "+7" || field.value === "") {
                              setTimeout(() => {
                                e.target.setSelectionRange(2, 2);
                              }, 0);
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Имя (необязательно)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Имя пользователя"
                          className="things-input"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl transition-all"
                >
                  {createUserMutation.isPending ? "Создание..." : "Создать пользователя"}
                </Button>
              </form>
            </Form>
          </div>

          {/* Список пользователей */}
          <div className="content-panel">
            <h2 className="text-xl font-semibold mb-6">Список пользователей</h2>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : users.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Нет пользователей</p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {users.map((u: any) => (
                  <div
                    key={u.id}
                    className="p-4 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    {editingUserId === u.id ? (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-muted-foreground">Телефон</label>
                          <Input
                            type="tel"
                            value={editPhone}
                            onChange={(e) => {
                              let value = e.target.value;
                              let cleaned = value.replace(/^\+?7?/, "");
                              let digits = cleaned.replace(/\D/g, "");
                              if (digits.startsWith("7") && digits.length > 1) {
                                digits = digits.slice(1);
                              }
                              const limitedDigits = digits.slice(0, 10);
                              setEditPhone("+7" + limitedDigits);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Backspace") {
                                const cursorPos = (e.target as HTMLInputElement).selectionStart || 0;
                                if (cursorPos <= 2) {
                                  e.preventDefault();
                                }
                              }
                              if (e.key === "Delete") {
                                const cursorPos = (e.target as HTMLInputElement).selectionStart || 0;
                                if (cursorPos < 2) {
                                  e.preventDefault();
                                }
                              }
                            }}
                            placeholder="xxx xxx xx xx"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Имя</label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Имя пользователя"
                            className="mt-1"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelEditing}
                            disabled={updateUserMutation.isPending}
                          >
                            <X className="w-4 h-4 mr-1" />
                            Отмена
                          </Button>
                          <Button
                            size="sm"
                            onClick={saveEditing}
                            disabled={updateUserMutation.isPending}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            {updateUserMutation.isPending ? "Сохранение..." : "Сохранить"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-foreground">{u.phone}</p>
                          {u.name && (
                            <p className="text-sm text-muted-foreground">{u.name}</p>
                          )}
                          {!u.isAdmin && u.bonusBalance > 0 && (
                            <div className="flex items-center gap-1.5 mt-2">
                              <Coins className="w-3.5 h-3.5 text-green-600" />
                              <span className="text-sm font-medium text-green-600">
                                {u.bonusBalance} ₽
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {!u.isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditing(u)}
                              className="text-xs"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {!u.isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm(`Удалить пользователя ${u.name || u.phone}?`)) {
                                  deleteUserMutation.mutate(u.id);
                                }
                              }}
                              disabled={deleteUserMutation.isPending}
                              className="text-xs text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {!u.isAdmin && u.bonusBalance > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (confirm(`Сбросить баланс ${u.bonusBalance} ₽ для ${u.name || u.phone}?`)) {
                                  resetBalanceMutation.mutate(u.id);
                                }
                              }}
                              disabled={resetBalanceMutation.isPending}
                              className="text-xs"
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1" />
                              Сброс
                            </Button>
                          )}
                          {u.isAdmin && (
                            <span className="px-2 py-1 text-xs font-medium bg-primary/20 text-primary rounded">
                              Админ
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
