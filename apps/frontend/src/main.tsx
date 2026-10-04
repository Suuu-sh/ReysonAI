import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { LegalPage } from "./site/LegalPage.tsx";
import { LEGAL_COPY } from "./site/legal-content.ts";
import { ServiceSite } from "./site/ServiceSite.tsx";
import { SITE_COPY } from "./site/locales.ts";
import type { SiteLocale } from "./site/content.ts";
import "./styles.css";
import "./site/site.css";
import { productLocale, rememberLocale } from "./locale.ts";
import { isProductAppRoute, legalDocumentOf } from "./route.ts";
import { APP_DATASETS, datasetNames, preloadDatasets } from "./estimated/datasets.ts";

// The app reads preflop datasets synchronously, so preload them and the dataset index
// before importing its module.
const withDatasets = (names, load) => () => Promise.all([preloadDatasets(names), datasetNames()]).then(load);
const ProductApp = lazy(withDatasets(APP_DATASETS, () => import("./ProductApp.tsx")));
const isProductRoute = isProductAppRoute(window.location.pathname, window.location.hostname);
const legalDocument = legalDocumentOf(window.location.pathname);
const initialSiteLocale = productLocale();
const copy = SITE_COPY[initialSiteLocale];
document.documentElement.lang = isProductRoute ? productLocale() : initialSiteLocale;
document.title = isProductRoute ? ({ en: "ReysonAI · Range Analysis", ja: "ReysonAI · レンジ分析", "zh-CN": "ReysonAI · 范围分析", es: "ReysonAI · Análisis de rangos" }[productLocale()]) : legalDocument ? `${LEGAL_COPY[initialSiteLocale][legalDocument].title} · ReysonAI` : copy.title;
if (!isProductRoute) document.querySelector('meta[name="description"]')?.setAttribute("content", legalDocument ? LEGAL_COPY[initialSiteLocale][legalDocument].lead : copy.description);

function MarketingSite() {
  const [locale, setLocale] = React.useState(initialSiteLocale);
  React.useEffect(() => {
    const selectedCopy = legalDocument
      ? { title: `${LEGAL_COPY[locale][legalDocument].title} · ReysonAI`, description: LEGAL_COPY[locale][legalDocument].lead }
      : SITE_COPY[locale];
    document.documentElement.lang = locale;
    document.title = selectedCopy.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", selectedCopy.description);
  }, [locale]);
  const switchLocale = (next: SiteLocale) => {
    rememberLocale(next);
    setLocale(next);
  };
  return legalDocument
    ? <LegalPage document={legalDocument} locale={locale} onLocaleChange={switchLocale} />
    : <ServiceSite locale={locale} onLocaleChange={switchLocale} />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isProductRoute
      ? <Suspense fallback={<div className="site-loading">{({ en: "Opening ReysonAI…", ja: "ReysonAIを開いています…", "zh-CN": "正在打开ReysonAI…", es: "Abriendo ReysonAI…" }[productLocale()])}</div>}><ProductApp /></Suspense>
      : <MarketingSite />}
  </React.StrictMode>,
);
