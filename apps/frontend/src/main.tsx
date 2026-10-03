import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { ServiceSite } from "./site/ServiceSite.tsx";
import { en } from "./site/content.ts";
import { ja } from "./site/content-ja.ts";
import "./styles.css";
import "./site/site.css";
import { productLocale, rememberLocale } from "./locale.ts";
import { isProductAppRoute } from "./route.ts";
import { APP_DATASETS, datasetNames, preloadDatasets } from "./estimated/datasets.ts";

// The app reads preflop datasets synchronously, so preload them and the dataset index
// before importing its module.
const withDatasets = (names, load) => () => Promise.all([preloadDatasets(names), datasetNames()]).then(load);
const ProductApp = lazy(withDatasets(APP_DATASETS, () => import("./ProductApp.tsx")));
const isProductRoute = isProductAppRoute(window.location.pathname, window.location.hostname);
const initialSiteLocale = productLocale();
const copy = initialSiteLocale === "ja" ? ja : en;
document.documentElement.lang = isProductRoute ? productLocale() : initialSiteLocale;
document.title = isProductRoute ? (productLocale() === "ja" ? "ReysonAI · レンジ分析" : "ReysonAI · Range Analysis") : copy.title;
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
    {isProductRoute
      ? <Suspense fallback={<div className="site-loading">Opening ReysonAI…</div>}><ProductApp /></Suspense>
      : <MarketingSite />}
  </React.StrictMode>,
);
