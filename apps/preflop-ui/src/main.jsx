import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { ServiceSite } from "./site/ServiceSite.tsx";
import "./styles.css";
import "./site/site.css";

const ProductApp = lazy(() => import("./ProductApp.jsx"));
const isProductRoute = window.location.pathname === "/app" || window.location.pathname.startsWith("/app/");
document.documentElement.lang = isProductRoute ? "ja" : "en";
document.title = isProductRoute ? "SolveaAI · Preflop Strategy" : "Solvea — Poker strategy, made playable";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isProductRoute
      ? <Suspense fallback={<div className="site-loading">Opening Solvea…</div>}><ProductApp /></Suspense>
      : <ServiceSite />}
  </React.StrictMode>,
);
