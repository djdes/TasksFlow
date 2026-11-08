import { useEffect, useRef, useState } from "react";
import { Mic, Square, Volume2 } from "lucide-react";
import { canSpeak, recognitionCtor, speak, stopSpeaking, type SpeechRecognitionLike } from "@/lib/speech";
import { cn } from "@/lib/utils";

/**
 * «Слушать» в окне задачи: телефон читает задачу вслух — тем, кому трудно
 * читать мелкий текст. Повторное касание — стоп. Без поддержки — не видна.
 */
export function SpeakButton({ text, compact = false, label = "Слушать" }: { text: string; compact?: boolean; label?: string }) {
  const [supported] = useState(canSpeak);
  const [speaking, setSpeaking] = useState(false);
  // Окно закрыли посреди чтения — замолкаем.
  useEffect(() => () => stopSpeaking(), []);
  if (!supported) return null;
  return (
    <button
      type="button"
      className={cn("task-speak", compact && "task-speak--compact", speaking && "is-on")}
      aria-pressed={speaking}
      aria-label={compact ? (speaking ? "Остановить чтение" : label) : undefined}
      title={compact ? label : undefined}
      onClick={() => {
        if (speaking) {
          stopSpeaking();
          setSpeaking(false);
          return;
        }
        setSpeaking(true);
        speak(text, () => setSpeaking(false));
      }}
      data-testid="task-speak"
    >
      {speaking ? <Square aria-hidden /> : <Volume2 aria-hidden />}
      {!compact && <span>{speaking ? "Стоп" : label}</span>}
    </button>
  );
}

/**
 * Микрофон в поле: надиктовать вместо набора. Распознанный текст уходит в
 * onText; пока слушает — кнопка красная. Без поддержки — не видна.
 */
export function VoiceInputButton({ onText, label = "Сказать голосом", className }: { onText: (text: string) => void; label?: string; className?: string }) {
  const [Ctor] = useState(recognitionCtor);
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  useEffect(() => () => rec.current?.abort(), []);
  if (!Ctor) return null;

  const start = () => {
    const r = new Ctor();
    r.lang = "ru-RU";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results).map((res) => res[0]?.transcript ?? "").join(" ").trim();
      if (text) onText(text.charAt(0).toUpperCase() + text.slice(1));
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return (
    <button
      type="button"
      className={cn("voice-input", className, listening && "is-on")}
      aria-label={listening ? "Остановить запись" : label}
      aria-pressed={listening}
      title={label}
      onClick={() => (listening ? rec.current?.stop() : start())}
      data-testid="voice-input"
    >
      {listening ? <Square aria-hidden /> : <Mic aria-hidden />}
    </button>
  );
}
