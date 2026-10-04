import { accountSnapshot, accountStorage, saveAccountData } from "./account/session.ts";
import { translateLocaleCopy } from "./locales/copy.ts";

import { isProductLocale, type ProductLocale } from "./locale-metadata.ts";
export { LOCALES, isProductLocale, type ProductLocale } from "./locale-metadata.ts";
export const localeTag = () => ({ en: "en-US", ja: "ja-JP", "zh-CN": "zh-CN", es: "es-ES" })[productLocale()];
export const LOCALE_KEY = "reysonai:locale:v1";

export function productLocale(): ProductLocale {
  // Pure model/SSR callers keep their historical Japanese output; the actual
  // product runs in a browser, where an unset preference always means English.
  if (typeof window === "undefined") return "ja";
  try { const saved = accountStorage().getItem(LOCALE_KEY); return isProductLocale(saved) ? saved : "en"; }
  catch { return "en"; }
}

export function rememberLocale(locale) {
  if (!isProductLocale(locale)) return;
  try { accountStorage().setItem(LOCALE_KEY, locale); } catch {}
}

export async function selectProductLocale(locale) {
  if (!isProductLocale(locale)) return;
  rememberLocale(locale);
  await saveAccountData();
  if (accountSnapshot().user && accountSnapshot().error) return;
  window.location.reload();
}

export const localized = (english, japanese) => productLocale() === "ja" ? japanese : translateLocaleCopy(english, productLocale());
