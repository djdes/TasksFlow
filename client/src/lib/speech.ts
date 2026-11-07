/**
 * Голос в кабинете: прочитать задачу вслух (speechSynthesis) и надиктовать
 * название (SpeechRecognition). Оба API есть не везде — кнопки показываются,
 * только когда браузер их умеет (Chrome и Android-приложение, Safari на iPhone).
 */

type RecognitionResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };

export type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionCtor = new () => SpeechRecognitionLike;

export function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** Текст задачи для чтения вслух: название, описание, вопросы и пункты. */
export function taskSpeechText(task: {
  title: string;
  description?: string | null;
  checklist?: readonly { title: string; options?: readonly string[] | null }[] | null;
}): string {
  const parts = [task.title.trim()];
  if (task.description?.trim()) parts.push(task.description.trim());
  for (const item of task.checklist ?? []) {
    const title = item.title.trim();
    if (!title) continue;
    parts.push(item.options?.length ? `Вопрос: ${title} Варианты: ${item.options.join(", ")}` : title);
  }
  return parts.map((p) => (/[.!?…]$/.test(p) ? p : `${p}.`)).join(" ");
}

export function speak(text: string, onEnd?: () => void): void {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ru-RU";
  u.rate = 0.95;
  const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("ru"));
  if (voice) u.voice = voice;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}
