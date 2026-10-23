import { createRoot } from "react-dom/client";
import App from "./App";
import { installErrorReporting } from "./lib/error-reporting";
import "./index.css";
import "./motion.css";
import "./workspace.css";

installErrorReporting();
createRoot(document.getElementById("root")!).render(<App />);
