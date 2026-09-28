export const LOCALE_KEY = "solveaai:locale:v1";

export function productLocale() {
  // Pure model/SSR callers keep their historical Japanese output; the actual
  // product runs in a browser, where an unset preference always means English.
  if (typeof window === "undefined") return "ja";
  try { return window.localStorage.getItem(LOCALE_KEY) === "ja" ? "ja" : "en"; }
  catch { return "en"; }
}

export function canonicalServiceSiteUrl({ pathname, search = "", hash = "" }) {
  return pathname === "/" ? null : `/${search}${hash}`;
}

export function rememberLocale(locale) {
  if (locale !== "en" && locale !== "ja") return;
  try { window.localStorage.setItem(LOCALE_KEY, locale); } catch {}
}

export function selectProductLocale(locale) {
  if (locale !== "en" && locale !== "ja") return;
  rememberLocale(locale);
  window.location.reload();
}

export const localized = (english, japanese) => productLocale() === "ja" ? japanese : english;
