import { Sparkles } from "lucide-react";
import { useMotionPreference } from "@/contexts/MotionContext";

export function MotionToggle() {
  const { enabled, setEnabled } = useMotionPreference();
  return (
    <button type="button" role="switch" aria-checked={enabled} aria-label="Анимации интерфейса"
      className="dropdown-item w-full" onClick={() => setEnabled(!enabled)}>
      <Sparkles className="w-5 h-5 text-primary" />
      <span className="font-medium flex-1 text-left">Анимации</span>
      <span className="motion-toggle" data-checked={enabled} aria-hidden="true"><span /></span>
    </button>
  );
}
