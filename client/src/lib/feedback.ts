/**
 * Тактильный + аудио feedback для значимых действий — закрытие задачи,
 * подтверждение формы. Цель: воркер физически чувствует «отметка
 * прошла», не нужно проверять глазами что задача стала зелёной.
 *
 * Хранится opt-in флаг в localStorage `tf_feedback_enabled` (default
 * true — не молчаливо, но через меню можно выключить если раздражает
 * на ночной смене или в open-space).
 *
 * Звук — короткий «дзынь» из Web Audio API (sine 880→440 Hz, 80мс),
 * без mp3-зависимостей. На iOS до первого user-tap'а audioContext
 * заблокирован — это OK, всё равно играть до первого тапа смысла нет.
 *
 * Вибрация — Web Vibration API (Android, не работает на iOS), 25мс.
 */

const FEEDBACK_KEY = "tf_feedback_enabled";

export function isFeedbackEnabled(): boolean {
  try {
    const v = window.localStorage.getItem(FEEDBACK_KEY);
    return v === null || v === "true";
  } catch {
    return true;
  }
}

export function setFeedbackEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(FEEDBACK_KEY, enabled ? "true" : "false");
  } catch {
    /* ignore */
  }
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext })
      .AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

/**
 * Короткий «успех» — два щелчка вверх по тону (880 → 1320 Hz, 60+60мс).
 * Достаточно слышно но не назойливо. Громкость ~0.18.
 */
export function playSuccessTone(): void {
  if (!isFeedbackEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  // Resume контекст после user-gesture (Safari/iOS).
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => null);
  }
  try {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    gain.connect(ctx.destination);

    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.06);
    osc1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.18);
  } catch {
    /* AudioContext can throw on weird platforms — silent fail */
  }
}

/**
 * Короткая вибрация-подтверждение (25мс). На iOS Safari Web Vibration
 * API не поддерживается — вернёт false и ничего не сделает.
 */
export function vibrateTap(): void {
  if (!isFeedbackEnabled()) return;
  if (typeof navigator === "undefined") return;
  if (!navigator.vibrate) return;
  try {
    navigator.vibrate(25);
  } catch {
    /* ignore */
  }
}

/** Совмещённый тактильный + аудио feedback для «задача закрыта». */
export function feedbackTaskComplete(): void {
  vibrateTap();
  playSuccessTone();
}
