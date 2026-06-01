import { hydrateRoot } from "react-dom/client";
import { PublicApp } from "./App";
import { matchRoute } from "./router";
import "../index.css";

const data = (window as any).__SSR_DATA__ ?? null;
const route = matchRoute(window.location.pathname);
const el = document.getElementById("public-root");
if (el) {
  hydrateRoot(el, <PublicApp route={route} data={data} />);
}
