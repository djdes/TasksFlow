import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  copied: boolean;
}

/**
 * Error Boundary для перехвата ошибок в React компонентах
 *
 * Использование:
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 *
 * Или с кастомным fallback:
 * <ErrorBoundary fallback={<div>Произошла ошибка</div>}>
 *   <YourComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, copied: false };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Сохраняем componentStack чтобы показать пользователю при копировании
    // — без этого мы видели только «Что-то пошло не так» и не могли
    // воспроизвести баг по тонкому стеку из консоли.
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleCopyDetails = async () => {
    const { error, errorInfo } = this.state;
    const text = [
      `URL: ${window.location.href}`,
      `Time: ${new Date().toISOString()}`,
      `User-Agent: ${navigator.userAgent}`,
      `Error: ${error?.name ?? "Error"}: ${error?.message ?? "(no message)"}`,
      "",
      "Stack:",
      error?.stack ?? "(no stack)",
      "",
      "Component stack:",
      errorInfo?.componentStack ?? "(not captured)",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Clipboard API может быть заблокирован (file:// или http:) —
      // показываем prompt чтобы пользователь мог сам выделить.
      window.prompt("Скопируйте текст ниже и пришлите разработчикам:", text);
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message ?? "(пустое сообщение)";
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-6 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Что-то пошло не так
            </h2>
            <p className="text-gray-600 mb-4">
              Произошла непредвиденная ошибка. Попробуйте обновить страницу или
              повторить действие.
            </p>
            {/*
             * Сообщение ошибки показываем всегда (раньше было только в dev) —
             * иначе пользователь видит "что-то пошло не так" и не может
             * сообщить разработчикам что именно случилось. В проде сюда
             * могут попадать сообщения типа "Cannot read properties of
             * undefined (reading 'rows')" — это уже шаг вперёд.
             */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-left">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                Сообщение
              </p>
              <p className="text-sm font-mono text-red-700 break-all">
                {errorMessage}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <Button variant="outline" onClick={this.handleRetry}>
                Повторить
              </Button>
              <Button variant="outline" onClick={this.handleCopyDetails}>
                {this.state.copied ? "Скопировано ✓" : "Скопировать детали"}
              </Button>
              <Button onClick={this.handleReload}>Обновить страницу</Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Хук для программного выброса ошибки в Error Boundary
 * Полезно для обработки ошибок в async функциях
 */
export function useErrorHandler() {
  return (error: Error) => {
    throw error;
  };
}
