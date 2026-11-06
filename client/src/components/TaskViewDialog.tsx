import { useState, useRef, useEffect } from "react";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { fetchOrFriendlyError } from "@/lib/queryClient";
import { parseJsonOrEmpty } from "@/lib/parse-json-or-empty";
import { uploadTaskPhoto, type UploadOutcome } from "@/lib/photo-upload";
import { useQueuedUploads } from "@/lib/upload-queue";
import { useCompanyPhotoSettings } from "@/hooks/use-wesetup";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, CheckCircle2, Trash2, RotateCcw, Camera, Check, Coins, ImageIcon, CalendarClock, AlertTriangle, CloudOff, ShieldCheck, ChevronRight, Clock, MessageCircleQuestion, MessageSquare } from "lucide-react";
import { FormBlock } from "@/components/FormBlock";
import { reviewersLine, type TaskReviewers } from "@shared/reviewers";
import { getDueStatus, formatDueBadge } from "@shared/task-visibility";
import { Textarea } from "@/components/ui/textarea";
import type { Task, ChecklistItem } from "@shared/schema";
import { allItemsNeedPhoto, isQuestionItem, itemNeedsPhoto } from "@shared/checklist";
import { CheckMark } from "@/components/ui/check-mark";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { usePermissions } from "@/hooks/use-permissions";
import { useAwaitingVerification } from "@/hooks/use-verification-queue";
import { isReviewTask } from "@/lib/task-classification";

interface TaskViewDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (comment?: string) => void;
  canComplete: boolean;
  onTaskUpdate?: (updatedTask: Task) => void;
}

export function TaskViewDialog({
  task,
  open,
  onOpenChange,
  onComplete,
  canComplete,
  onTaskUpdate,
}: TaskViewDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const photoSettings = useCompanyPhotoSettings();
  const queuedUploads = useQueuedUploads();
  const [preview, setPreview] = useState<string | null>(null);
  const [currentTask, setCurrentTask] = useState<Task | null>(task);
  const [isPhotoFullscreen, setIsPhotoFullscreen] = useState(false);
  const [fullscreenPhotoIndex, setFullscreenPhotoIndex] = useState(0);
  const [isExamplePhotoFullscreen, setIsExamplePhotoFullscreen] = useState(false);
  const [userComment, setUserComment] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // «Проверяет: …» — кто примет выполненное. Нет строки — без проверки.
  const reviewerTaskId = open && currentTask && !currentTask.isCompleted ? currentTask.id : null;
  const reviewers = useQuery<TaskReviewers>({
    queryKey: ["/api/tasks", reviewerTaskId, "reviewers"],
    queryFn: async () => {
      const res = await fetchOrFriendlyError(`/api/tasks/${reviewerTaskId}/reviewers`, { credentials: "include" });
      if (!res.ok) throw new Error("reviewers");
      return res.json();
    },
    enabled: reviewerTaskId !== null,
    staleTime: 60_000,
    retry: false,
  });
  const reviewersText = reviewerTaskId !== null ? reviewersLine(reviewers.data) : null;
  // Задача «принять чужую работу» — проверяющему сразу кнопка в «На проверке».
  const [, setLocation] = useLocation();
  const { canVerify } = usePermissions();
  const showReviewLink = open && canVerify && !!currentTask && !currentTask.isCompleted && isReviewTask(currentTask);
  const reviewQueue = useAwaitingVerification(showReviewLink);
  const reviewCount = reviewQueue.data?.length ?? 0;

  // Получаем массив фотографий из задачи
  const getPhotoUrls = (t: Task | null): string[] => {
    if (!t) return [];
    const urls = (t as any).photoUrls;
    if (Array.isArray(urls) && urls.length > 0) return urls;
    // Обратная совместимость со старым полем photoUrl
    if (t.photoUrl) return [t.photoUrl];
    return [];
  };

  const photoUrls = getPhotoUrls(currentTask);
  const queuedHere = currentTask ? queuedUploads.filter((u) => u.taskId === currentTask.id).length : 0;
  const canAddMorePhotos = photoUrls.length < 10;

  // Чек-лист (подзадачи). Пункт с фото выполнен, когда есть фото; пункт без
  // фото (requiresPhoto: false) отмечается касанием.
  const checklist: ChecklistItem[] = (currentTask?.checklist as ChecklistItem[] | undefined) || [];
  const hasChecklist = checklist.length > 0;
  const checklistAllPhoto = allItemsNeedPhoto(checklist);
  const checklistDoneCount = checklist.filter((i) => i.done).length;
  const allChecklistDone = hasChecklist && checklistDoneCount === checklist.length;
  // Свои вопросы («Кто заполняет?») — пункты с вариантами ответа: отдельный
  // блок над чек-листом, без счётчика и полосы.
  const questionItems = checklist.filter(isQuestionItem);
  const checkItems = checklist.filter((i) => !isQuestionItem(i));
  const checkDone = checkItems.filter((i) => i.done).length;
  const leftOnlyQuestions = hasChecklist && !allChecklistDone && checklist.every((i) => i.done || isQuestionItem(i));
  const checklistFileInputRef = useRef<HTMLInputElement>(null);
  const checklistUploadItemIdRef = useRef<string | null>(null);

  React.useEffect(() => {
    if (task) {
      const taskWithDefaults: Task = {
        ...task,
        requiresPhoto: (task as any).requiresPhoto !== undefined
          ? Boolean((task as any).requiresPhoto)
          : (task as any).requires_photo !== undefined
            ? Boolean((task as any).requires_photo)
            : false,
        photoUrl: (task as any).photoUrl !== undefined
          ? (task as any).photoUrl
          : (task as any).photo_url ?? null,
      };
      setCurrentTask(taskWithDefaults);
    } else {
      setCurrentTask(null);
    }
  }, [task]);

  const uploadPhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!currentTask) throw new Error("Задача не выбрана");
      // Сжатие до 1600 px, время на фото и очередь без сети — photo-upload.ts.
      return uploadTaskPhoto<{ photoUrl: string; photoUrls: string[] }>({
        taskId: currentTask.id,
        file,
        stamp: photoSettings.stamp,
        place: photoSettings.place,
      });
    },
    onSuccess: async (outcome: UploadOutcome<{ photoUrl: string; photoUrls: string[] }>) => {
      if (outcome.queued) {
        toast({ title: "Нет связи", description: "Фото сохранено и отправится само, когда появится интернет" });
        setSelectedFile(null);
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      const data = outcome.data;
      if (currentTask) {
        const updatedTask = {
          ...currentTask,
          photoUrl: data.photoUrl,
          photoUrls: data.photoUrls,
        } as Task;
        setCurrentTask(updatedTask);
        if (onTaskUpdate) {
          onTaskUpdate(updatedTask);
        }
      }
      await queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
      toast({
        title: "Успешно",
        description: `Фотография загружена (${data.photoUrls.length}/10)`,
      });
      setSelectedFile(null);
      setPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось загрузить фотографию",
        variant: "destructive",
      });
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoUrl: string) => {
      if (!currentTask) throw new Error("Задача не выбрана");

      // 30s timeout: DELETE — лёгкая операция, server обычно отвечает <1s.
      // С таймаутом ошибки сети становятся видимыми, без — вечно spinner.
      const response = await fetchOrFriendlyError(`/api/tasks/${currentTask.id}/photo?url=${encodeURIComponent(photoUrl)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(30_000),
        credentials: "include",
        headers: {
          "Accept": "application/json",
        },
      });

      const text = await response.text();
      const data = parseJsonOrEmpty(text);

      if (!response.ok) {
        throw new Error(
          (data.message as string | undefined) || "Ошибка удаления фото",
        );
      }

      return data as { success: boolean; photoUrls: string[] };
    },
    onSuccess: async (data: { success: boolean; photoUrls: string[] }) => {
      if (currentTask) {
        const lastPhotoUrl = data.photoUrls.length > 0 ? data.photoUrls[data.photoUrls.length - 1] : null;
        const updatedTask = {
          ...currentTask,
          photoUrl: lastPhotoUrl,
          photoUrls: data.photoUrls,
        } as Task;
        setCurrentTask(updatedTask);
        if (onTaskUpdate) {
          onTaskUpdate(updatedTask);
        }
      }
      await queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
      toast({
        title: "Успешно",
        description: "Фотография удалена",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить фотографию",
        variant: "destructive",
      });
    },
  });

  const handleDeletePhoto = (photoUrl: string) => {
    if (confirm("Удалить фотографию?")) {
      deletePhotoMutation.mutate(photoUrl);
    }
  };

  // ===== Чек-лист: фото на пункт =====
  const uploadChecklistPhotoMutation = useMutation({
    mutationFn: async ({ file, itemId }: { file: File; itemId: string }) => {
      if (!currentTask) throw new Error("Задача не выбрана");
      return uploadTaskPhoto<{ photoUrl: string; task: Task }>({
        taskId: currentTask.id,
        itemId,
        file,
        stamp: photoSettings.stamp,
        place: photoSettings.place,
      });
    },
    onSuccess: async (outcome) => {
      if (outcome.queued) {
        toast({ title: "Нет связи", description: "Фото пункта отправится само, когда появится интернет" });
        return;
      }
      const data = outcome.data;
      if (data.task) { setCurrentTask(data.task); onTaskUpdate?.(data.task); }
      await queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message || "Не удалось загрузить фото", variant: "destructive" });
    },
  });

  const deleteChecklistPhotoMutation = useMutation({
    mutationFn: async ({ itemId, url }: { itemId: string; url: string }) => {
      if (!currentTask) throw new Error("Задача не выбрана");
      const response = await fetchOrFriendlyError(
        `/api/tasks/${currentTask.id}/checklist/${encodeURIComponent(itemId)}/photo?url=${encodeURIComponent(url)}`,
        { method: "DELETE", credentials: "include", signal: AbortSignal.timeout(30_000), headers: { Accept: "application/json" } },
      );
      const text = await response.text();
      const d = parseJsonOrEmpty(text);
      if (!response.ok) throw new Error((d.message as string | undefined) || "Ошибка удаления фото");
      return d as { task: Task };
    },
    onSuccess: async (data) => {
      if (data.task) { setCurrentTask(data.task); onTaskUpdate?.(data.task); }
      await queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message || "Не удалось удалить фото", variant: "destructive" });
    },
  });

  // Пункт без фото: отметить касанием или снять отметку.
  const toggleChecklistItemMutation = useMutation({
    mutationFn: async ({ itemId, done }: { itemId: string; done: boolean }) => {
      if (!currentTask) throw new Error("Задача не выбрана");
      const response = await fetchOrFriendlyError(
        `/api/tasks/${currentTask.id}/checklist/${encodeURIComponent(itemId)}/done`,
        {
          method: "POST",
          credentials: "include",
          signal: AbortSignal.timeout(30_000),
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ done }),
        },
      );
      const text = await response.text();
      const d = parseJsonOrEmpty(text);
      if (!response.ok) throw new Error((d.message as string | undefined) || "Не удалось отметить пункт");
      return d as { task: Task };
    },
    onSuccess: async (data) => {
      if (data.task) { setCurrentTask(data.task); onTaskUpdate?.(data.task); }
      await queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message || "Не удалось отметить пункт", variant: "destructive" });
    },
  });

  // Свой вопрос: выбранный вариант сразу уходит на сервер (как отметка пункта).
  const answerQuestionMutation = useMutation({
    mutationFn: async ({ itemId, answer }: { itemId: string; answer: string | null }) => {
      if (!currentTask) throw new Error("Задача не выбрана");
      const response = await fetchOrFriendlyError(
        `/api/tasks/${currentTask.id}/checklist/${encodeURIComponent(itemId)}/answer`,
        {
          method: "POST",
          credentials: "include",
          signal: AbortSignal.timeout(30_000),
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ answer }),
        },
      );
      const text = await response.text();
      const d = parseJsonOrEmpty(text);
      if (!response.ok) throw new Error((d.message as string | undefined) || "Не удалось сохранить ответ");
      return d as { task: Task };
    },
    onSuccess: async (data) => {
      if (data.task) { setCurrentTask(data.task); onTaskUpdate?.(data.task); }
      await queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message || "Не удалось сохранить ответ", variant: "destructive" });
    },
  });

  const openChecklistPhotoPicker = (itemId: string) => {
    checklistUploadItemIdRef.current = itemId;
    checklistFileInputRef.current?.click();
  };
  const handleChecklistFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const itemId = checklistUploadItemIdRef.current;
    if (file && itemId) {
      if (!file.type.startsWith("image/")) {
        toast({ title: "Ошибка", description: "Выберите изображение", variant: "destructive" });
      } else {
        uploadChecklistPhotoMutation.mutate({ file, itemId });
      }
    }
    if (checklistFileInputRef.current) checklistFileInputRef.current.value = "";
    checklistUploadItemIdRef.current = null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Ошибка",
          description: "Выберите изображение",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setTimeout(() => {
        uploadPhotoMutation.mutate(file);
      }, 100);
    }
  };

  const handleUpload = () => {
    if (selectedFile && currentTask) {
      uploadPhotoMutation.mutate(selectedFile);
    }
  };

  const handleComplete = () => {
    if (currentTask?.requiresPhoto && photoUrls.length === 0) {
      toast({
        title: "Ошибка",
        description: "Сначала загрузите фотографию",
        variant: "destructive",
      });
      return;
    }
    if (hasChecklist && !allChecklistDone) {
      toast({
        title: "Не всё готово",
        description: leftOnlyQuestions
          ? "Выберите ответ на вопрос"
          : `Отметьте пункты${checklistAllPhoto ? " фото" : ""}: ${checkDone}/${checkItems.length}`,
        variant: "destructive",
      });
      return;
    }
    onComplete(userComment || undefined);
    setUserComment("");
  };

  if (!currentTask) return null;

  const hasPrice = (currentTask as any).price > 0;
  const dueStatus = getDueStatus((currentTask as any).dueDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 border-0">
        {/* Header with gradient */}
        <div className="task-detail-header px-4 pt-5 pb-0">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground pr-8 leading-snug">
              {currentTask.title}
            </DialogTitle>
            {(currentTask as any).description ? (
              <DialogDescription className="text-muted-foreground text-base mt-1.5">
                {(currentTask as any).description}
              </DialogDescription>
            ) : (
              // Без описания — короткая подсказка для экранного диктора.
              <DialogDescription className="sr-only">Задача: выполнение, фото и детали</DialogDescription>
            )}
          </DialogHeader>


          {/* Бейджи в шапке: премия и срок */}
          <div className="mt-3 flex flex-wrap items-center gap-2 empty:hidden">
            {/* Кто примет работу — значком, полная строка — в подсказке. */}
            {reviewersText ? (
              <div
                className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded-lg text-sm font-semibold"
                title={reviewersText}
                aria-label={reviewersText}
                data-testid="task-reviewers"
              >
                <ShieldCheck className="w-4 h-4" aria-hidden />
                <span>На проверку</span>
              </div>
            ) : null}
            {hasPrice && (
              <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 rounded-lg text-sm font-semibold">
                <Coins className="w-4 h-4" />
                <span>+{(currentTask as any).price} ₽</span>
              </div>
            )}
            {dueStatus.kind !== "none" && (
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-semibold ${
                  dueStatus.kind === "overdue"
                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                    : "bg-muted text-muted-foreground"
                }`}
                data-testid="dialog-due-badge"
              >
                {dueStatus.kind === "overdue" ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <CalendarClock className="w-4 h-4" />
                )}
                <span>
                  {dueStatus.kind === "overdue"
                    ? `Просрочено на ${dueStatus.daysOverdue} дн.`
                    : `Срок: ${formatDueBadge((currentTask as any).dueDate)}`}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="task-detail-body p-4 space-y-4">
          {showReviewLink && (
            <button
              type="button"
              onClick={() => { onOpenChange(false); setLocation("/admin/verification"); }}
              className="flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-left transition-colors hover:bg-primary/15"
              data-testid="task-open-verification"
            >
              <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">Открыть «На проверке»</span>
                <span className="block text-sm text-muted-foreground">
                  {reviewQueue.isPending ? "Смотрим, что ждёт…" : reviewCount > 0 ? `Ждут проверки: ${reviewCount}` : "Сейчас ничего не ждёт проверки"}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          )}

          {/* Фото к задаче от руководителя: что и как сделать. Видно сразу, касание — во весь экран. */}
          {(currentTask as any).examplePhotoUrl && (
            <FormBlock label="Пример" tone="photo" testId="task-attached-photo">
              <button
                type="button"
                onClick={() => setIsExamplePhotoFullscreen(true)}
                className="task-example relative block overflow-hidden rounded-xl border border-border"
                aria-label="Открыть фото к задаче во весь экран"
              >
                <span className="task-example-badge">
                  <ImageIcon aria-hidden />
                  Пример
                </span>
                <img
                  src={(currentTask as any).examplePhotoUrl}
                  alt="Фото к задаче"
                  loading="lazy"
                  className="max-h-40 w-auto max-w-full object-contain bg-muted/40"
                />
              </button>
            </FormBlock>
          )}

          {/* Photo upload section — скрываем, если у задачи есть чек-лист
              (там фото идёт по каждому пункту отдельно). */}
          {!hasChecklist && (currentTask.requiresPhoto === true || (currentTask.requiresPhoto as any) === 1) && (
            <FormBlock label="Фото результата" tone="photo">

              {queuedHere > 0 && (
                <p className="mb-3 flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200" role="status">
                  <CloudOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {queuedHere === 1 ? "1 фото ждёт сети — отправится само" : `${queuedHere} фото ждут сети — отправятся сами`}
                </p>
              )}

              {/* Uploaded photos grid */}
              {photoUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {photoUrls.map((url, index) => (
                    <div key={url} className="relative aspect-square group">
                      {/* loading="lazy": при 10 фото в 3-col grid нижние ~4
                          вне viewport до scroll — не тащим по сети сразу.
                          Помогает на 3G/4G, особенно когда задач много.
                          decoding="async": не блокирует main thread. */}
                      <img
                        src={url}
                        alt={`Фото ${index + 1}`}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
                        onClick={() => {
                          setFullscreenPhotoIndex(index);
                          setIsPhotoFullscreen(true);
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-xl pointer-events-none" />
                      <button
                        onClick={() => handleDeletePhoto(url)}
                        disabled={deletePhotoMutation.isPending}
                        className="absolute top-1.5 right-1.5 p-1.5 bg-red-500/90 backdrop-blur-sm text-white rounded-lg hover:bg-red-600 transition-all shadow-lg opacity-90 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <div className="absolute bottom-1.5 left-1.5 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-md font-medium">
                        {index + 1}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add more photos button */}
              {canAddMorePhotos && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture={photoSettings.cameraOnly ? "environment" : undefined}
                    onChange={handleFileSelect}
                    className="hidden"
                    id="photo-upload"
                  />
                  <label
                    htmlFor="photo-upload"
                    className={`flex flex-col items-center justify-center w-full h-14 border-2 border-dashed border-border bg-muted/40 rounded-xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors active:scale-[0.99]`}
                  >
                    {preview ? (
                      <div className="relative w-full h-full">
                        <img
                          src={preview}
                          alt="Preview"
                          className="w-full h-full object-cover rounded-xl"
                        />
                        {uploadPhotoMutation.isPending && (
                          <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center backdrop-blur-sm">
                            <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className={`${photoUrls.length > 0 ? 'w-10 h-10' : 'w-12 h-12'} rounded-full bg-primary/10 flex items-center justify-center`}>
                          <Camera className={`${photoUrls.length > 0 ? 'w-5 h-5' : 'w-6 h-6'} text-primary`} />
                        </div>
                        <span className="task-detail-add">
                          {photoUrls.length > 0 ? 'Ещё фото' : 'Фото результата'}
                        </span>
                      </div>
                    )}
                  </label>
                </div>
              )}
            </FormBlock>
          )}

          {/* Свои вопросы («Кто заполняет?»): ответ — из выпадающего списка.
              Пока задача на проверке или закрыта — только ответ, без выбора. */}
          {questionItems.length > 0 && (
            <FormBlock label={questionItems.length > 1 ? "Вопросы" : "Вопрос"} tone="question">
              {questionItems.map((item) => {
                const canAnswer = canComplete && !currentTask.isCompleted && currentTask.verificationStatus !== "submitted";
                const answering =
                  answerQuestionMutation.isPending && answerQuestionMutation.variables?.itemId === item.id;
                return (
                  <div key={item.id} className="task-answer" data-testid="checklist-question">
                    <p className="task-answer-title">
                      <MessageCircleQuestion aria-hidden className="task-answer-icon" />
                      <span>{item.title}</span>
                      {item.done ? <CheckCircle2 className="task-answer-done" aria-label="Ответ есть" /> : null}
                    </p>
                    {canAnswer ? (
                      <select
                        value={item.answer ?? ""}
                        disabled={answering}
                        onChange={(e) => answerQuestionMutation.mutate({ itemId: item.id, answer: e.target.value || null })}
                        aria-label={item.title}
                        className={cn("task-answer-select", !item.answer && "is-empty")}
                        data-testid="checklist-question-select"
                      >
                        <option value="">Выберите ответ</option>
                        {(item.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <p className={cn("task-answer-value", !item.answer && "is-empty")}>{item.answer ?? "Ответа нет"}</p>
                    )}
                  </div>
                );
              })}
            </FormBlock>
          )}

          {/* Чек-лист: пункт с фото закрывается фото, без фото — касанием. */}
          {checkItems.length > 0 && (
            <FormBlock label={`Чек-лист: ${checkDone} из ${checkItems.length}`} tone="check">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden>
                <div
                  className="h-full bg-emerald-500 rounded-full transition-[width] duration-300"
                  style={{ width: `${(checkDone / checkItems.length) * 100}%` }}
                />
              </div>
              <div className="space-y-2">
                {checkItems.map((item) => {
                  const itemPhotos = item.photoUrls || [];
                  const busy =
                    uploadChecklistPhotoMutation.isPending &&
                    uploadChecklistPhotoMutation.variables?.itemId === item.id;
                  const editable = canComplete && !currentTask.isCompleted;
                  const needsPhoto = itemNeedsPhoto(item);
                  const mark = (
                    <CheckMark
                      checked={Boolean(item.done)}
                      className={cn(
                        "w-7 h-7 rounded-lg border-2 [&>svg]:w-4 [&>svg]:h-4",
                        item.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-muted-foreground/30",
                      )}
                    />
                  );
                  const rowTone = item.done
                    ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                    : "border-border bg-background";
                  if (!needsPhoto) {
                    // Без фото: вся строка — переключатель. Пока задача на
                    // проверке, пункты не меняются (сервер ответит 409).
                    const canToggle = editable && currentTask.verificationStatus !== "submitted";
                    const toggling =
                      toggleChecklistItemMutation.isPending &&
                      toggleChecklistItemMutation.variables?.itemId === item.id;
                    const label = (
                      <>
                        {mark}
                        <span className={`task-check-title ${item.done ? "is-done" : ""}`}>
                          {item.title}
                        </span>
                      </>
                    );
                    return canToggle ? (
                      <button
                        key={item.id}
                        type="button"
                        role="checkbox"
                        aria-checked={Boolean(item.done)}
                        data-testid="checklist-item-toggle"
                        disabled={toggling}
                        onClick={() => toggleChecklistItemMutation.mutate({ itemId: item.id, done: !item.done })}
                        className={`w-full text-left rounded-xl border p-2.5 flex items-center gap-3 min-h-[3.25rem] transition-colors disabled:opacity-60 active:scale-[0.99] ${rowTone}`}
                      >
                        {label}
                      </button>
                    ) : (
                      <div key={item.id} className={`rounded-xl border p-2.5 flex items-center gap-3 min-h-[3.25rem] ${rowTone}`}>
                        {label}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-2.5 flex items-center gap-3 ${
                        item.done
                          ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                          : "border-border bg-background"
                      }`}
                    >
                      {mark}
                      <span className={`task-check-title ${item.done ? "is-done" : ""}`}>
                        {item.title}
                      </span>
                      {item.done && itemPhotos[0] ? (
                        <div className="relative shrink-0">
                          <img
                            src={itemPhotos[0]}
                            alt=""
                            className="w-11 h-11 rounded-lg object-cover border border-emerald-300"
                          />
                          {editable && (
                            <button
                              type="button"
                              onClick={() =>
                                deleteChecklistPhotoMutation.mutate({ itemId: item.id, url: itemPhotos[0] })
                              }
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white grid place-items-center shadow"
                              aria-label="Переснять"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ) : (
                        editable && (
                          <button
                            type="button"
                            onClick={() => openChecklistPhotoPicker(item.id)}
                            disabled={busy}
                            className="shrink-0 inline-flex items-center gap-1.5 min-h-10 rounded-xl bg-primary text-primary-foreground text-[0.9375rem] font-semibold px-3.5 disabled:opacity-60 active:scale-[0.98] transition"
                          >
                            {busy ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Camera className="w-4 h-4" />
                            )}
                            Фото
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
              <input
                ref={checklistFileInputRef}
                type="file"
                accept="image/*"
                capture={photoSettings.cameraOnly ? "environment" : undefined}
                onChange={handleChecklistFileSelect}
                className="hidden"
              />
            </FormBlock>
          )}

          {/* User comment field */}
          {canComplete && !currentTask.isCompleted && currentTask.verificationStatus !== "submitted" && (
            <div className="field-icon-wrap">
              <MessageSquare aria-hidden className="field-icon" />
              <Textarea
                value={userComment}
                onChange={(e) => setUserComment(e.target.value)}
                placeholder="Комментарий"
                aria-label="Комментарий"
                rows={1}
                className="things-input task-comment resize-none"
              />
            </div>
          )}

          {/* Кнопка внизу шторки всегда видна — без прокрутки. */}
          <div className="task-detail-actions">
            {canComplete && (
              currentTask.isCompleted ? (
                // Журнальные задачи нельзя «вернуть в работу» —
                // запись в журнале не должна стираться обратным
                // toggle'ом. Вместо этого открываем inline форму
                // редактирования (TaskFormFiller на стороне Dashboard
                // через openJournalForm) с auto-prefilled значениями.
                // Сотрудник никогда не покидает TasksFlow — П-1 спека.
                <button
                  onClick={() => onComplete()}
                  className="flex items-center justify-center gap-2.5 w-full h-14 bg-muted hover:bg-muted/70 text-foreground rounded-2xl font-semibold transition-colors"
                >
                  <RotateCcw className="w-5 h-5" />
                  {Boolean((currentTask as { journalLink?: string | null }).journalLink)
                    ? "Изменить данные"
                    : "Вернуть в работу"}
                </button>
              ) : currentTask.verificationStatus === "submitted" ? (
                // Уже отправлена: второе «Завершить» ничего бы не сделало.
                <div
                  role="status"
                  className="flex items-center justify-center gap-2 w-full min-h-14 px-4 rounded-2xl bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200 font-semibold text-center"
                  data-testid="task-submitted-status"
                >
                  <Clock className="w-5 h-5 shrink-0" aria-hidden />
                  На проверке
                </div>
              ) : (
                <button
                  onClick={handleComplete}
                  disabled={
                    (currentTask.requiresPhoto && photoUrls.length === 0) ||
                    (hasChecklist && !allChecklistDone)
                  }
                  className="flex items-center justify-center gap-2 w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white text-base rounded-2xl font-semibold transition-colors disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  <Check className="w-5 h-5" strokeWidth={2.5} />
                  {hasChecklist && !allChecklistDone
                    ? leftOnlyQuestions
                      ? "Выберите ответ"
                      : `Отметьте пункты ${checkDone}/${checkItems.length}`
                    : currentTask.requiresPhoto && photoUrls.length === 0
                      ? "Нужно фото"
                      : "Готово"}
                </button>
              )
            )}
            {/* Закрыть — крестик и свайп; отдельная кнопка — только когда другой нет. */}
            {!canComplete && (
              <button
                onClick={() => onOpenChange(false)}
                className="w-full h-12 text-muted-foreground hover:text-foreground hover:bg-muted rounded-2xl font-medium transition-colors"
              >
                Закрыть
              </button>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Fullscreen photo modal with navigation */}
      {isPhotoFullscreen && photoUrls.length > 0 && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center cursor-pointer"
          onClick={() => setIsPhotoFullscreen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
            onClick={() => setIsPhotoFullscreen(false)}
            aria-label="Закрыть"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {/* Navigation arrows */}
          {photoUrls.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreenPhotoIndex(prev => prev > 0 ? prev - 1 : photoUrls.length - 1);
                }}
                aria-label="Предыдущее фото"
              >
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreenPhotoIndex(prev => prev < photoUrls.length - 1 ? prev + 1 : 0);
                }}
                aria-label="Следующее фото"
              >
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}

          {/* Photo counter */}
          {photoUrls.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
              {fullscreenPhotoIndex + 1} / {photoUrls.length}
            </div>
          )}

          <img
            src={photoUrls[fullscreenPhotoIndex]}
            alt={`Фото ${fullscreenPhotoIndex + 1}`}
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Fullscreen example photo modal */}
      {isExamplePhotoFullscreen && (currentTask as any)?.examplePhotoUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center cursor-pointer"
          onClick={() => setIsExamplePhotoFullscreen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            onClick={() => setIsExamplePhotoFullscreen(false)}
            aria-label="Закрыть"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <div className="text-center">
            <p className="text-white/80 text-sm mb-4">Пример выполненной задачи</p>
            <img
              src={(currentTask as any).examplePhotoUrl}
              alt="Пример фото"
              className="max-w-[95vw] max-h-[85vh] object-contain rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </Dialog>
  );
}
