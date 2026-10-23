import { createRoot } from "react-dom/client";
import App from "./App";
import { installErrorReporting } from "./lib/error-reporting";
import { enterDemo, isDemo } from "./demo/demo-mode";
import { registerServiceWorker } from "./lib/pwa";
import "./index.css";
import "./motion.css";
import "./workspace.css";

async function start() {
  // /demo — кабинет без регистрации: API отвечает из памяти браузера.
  if (window.location.pathname === "/demo") {
    enterDemo();
    window.history.replaceState(null, "", "/dashboard");
  }
  if (isDemo()) {
    const { installDemoApi } = await import("./demo/demo-api");
    installDemoApi();
  } else {
    installErrorReporting();
  }
  createRoot(document.getElementById("root")!).render(<App />);
  registerServiceWorker();
}

void start();
