import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { ServiceSite } from "./site/ServiceSite.tsx";
import { en } from "./site/content.ts";
import { ja } from "./site/content-ja.ts";
import "./styles.css";
import "./site/site.css";

const ProductApp = lazy(() => import("./ProductApp.jsx"));
const isProductRoute = window.location.pathname === "/app" || window.location.pathname.startsWith("/app/");
const locale = window.location.pathname === "/ja" || window.location.pathname.startsWith("/ja/") ? "ja" : "en";
const copy = locale === "ja" ? ja : en;
document.documentElement.lang = isProductRoute ? "ja" : locale;
document.title = isProductRoute ? "SolveaAI · Preflop Strategy" : copy.title;
if (!isProductRoute) document.querySelector('meta[name="description"]')?.setAttribute("content", copy.description);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isProductRoute
      ? <Suspense fallback={<div className="site-loading">Opening Solvea…</div>}><ProductApp /></Suspense>
      : <ServiceSite locale={locale} />}
  </React.StrictMode>,
);
