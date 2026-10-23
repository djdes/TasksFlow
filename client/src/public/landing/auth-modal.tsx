import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { AuthForm } from "./auth";

/**
 * Окно входа лендинга. Отдельный модуль ради ленивой загрузки: Nav
 * импортирует его только при первом открытии (или наведении на «Войти»),
 * поэтому диалог (Radix + vaul) не едет в первый экран вместе с формой
 * в hero.
 */
export default function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-md bg-card p-6 sm:p-7">
        <div>
          <DialogTitle className="text-xl font-bold text-foreground mb-1 pr-6">Вход в TasksFlow</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mb-5">Введите телефон или email — войдём или зарегистрируем.</DialogDescription>
          <AuthForm layout="stacked" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
