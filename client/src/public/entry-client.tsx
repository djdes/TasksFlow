import { hydrateRoot } from "react-dom/client";
import { PublicApp } from "./App";
import { matchRoute } from "./router";
import "../index.css";
import "./public.css";

// Сообщаем inline-скрипту, что ревил активен (он не снимет reveal-ready).
(window as any).__revealActive = true;

const data = (window as any).__SSR_DATA__ ?? null;
const route = matchRoute(window.location.pathname);
const el = document.getElementById("public-root");
if (el) {
  hydrateRoot(el, <PublicApp route={route} data={data} />);
}

// Scroll-reveal: показываем элементы [data-reveal] при попадании в зону
// видимости. Запускаем после гидрации; статический контент уже в DOM.
function setupReveal() {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
  if (!("IntersectionObserver" in window)) {
    els.forEach((e) => e.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
  );
  els.forEach((e) => io.observe(e));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupReveal);
} else {
  setupReveal();
}
