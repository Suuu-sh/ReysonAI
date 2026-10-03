import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { ServiceSite } from "./site/ServiceSite.tsx";
import { en } from "./site/content.ts";
import { ja } from "./site/content-ja.ts";
import "./styles.css";
import "./site/site.css";
import { productLocale, rememberLocale } from "./locale.ts";
import { ADMIN_DATASETS, APP_DATASETS, datasetNames, preloadDatasets } from "./estimated/datasets.ts";

// The app and the admin read preflop datasets synchronously, so each route preloads them
// (and the dataset index) before its module is imported.
const withDatasets = (names, load) => () => Promise.all([preloadDatasets(names), datasetNames()]).then(load);
const ProductApp = lazy(withDatasets(APP_DATASETS, () => import("./ProductApp.tsx")));
const AdminDashboard = lazy(withDatasets(ADMIN_DATASETS, () => import("./admin/AdminDashboard.tsx")));
const isAdminRoute = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");
const isProductRoute = window.location.pathname === "/app" || window.location.pathname.startsWith("/app/");
const initialSiteLocale = productLocale();
const copy = initialSiteLocale === "ja" ? ja : en;
document.documentElement.lang = isAdminRoute ? "en" : isProductRoute ? productLocale() : initialSiteLocale;
document.title = isAdminRoute ? "ReysonAI · Admin" : isProductRoute ? (productLocale() === "ja" ? "ReysonAI · レンジ分析" : "ReysonAI · Range Analysis") : copy.title;
if (!isProductRoute) document.querySelector('meta[name="description"]')?.setAttribute("content", copy.description);

function MarketingSite() {
  const [locale, setLocale] = React.useState(initialSiteLocale);
  React.useEffect(() => {
    const selectedCopy = locale === "ja" ? ja : en;
    document.documentElement.lang = locale;
    document.title = selectedCopy.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", selectedCopy.description);
  }, [locale]);
  const switchLocale = () => {
    const next = locale === "ja" ? "en" : "ja";
    rememberLocale(next);
    setLocale(next);
  };
  return <ServiceSite locale={locale} onLocaleChange={switchLocale} />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isAdminRoute
      ? <Suspense fallback={<div className="site-loading">Opening admin…</div>}><AdminDashboard /></Suspense>
      : isProductRoute
      ? <Suspense fallback={<div className="site-loading">Opening ReysonAI…</div>}><ProductApp /></Suspense>
      : <MarketingSite />}
  </React.StrictMode>,
);
