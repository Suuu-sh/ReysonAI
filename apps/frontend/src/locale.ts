import { accountSnapshot, accountStorage, saveAccountData } from "./account/session.ts";
export const LOCALE_KEY = "reysonai:locale:v1";

export function productLocale() {
  // Pure model/SSR callers keep their historical Japanese output; the actual
  // product runs in a browser, where an unset preference always means English.
  if (typeof window === "undefined") return "ja";
  try { return accountStorage().getItem(LOCALE_KEY) === "ja" ? "ja" : "en"; }
  catch { return "en"; }
}

export function rememberLocale(locale) {
  if (locale !== "en" && locale !== "ja") return;
  try { accountStorage().setItem(LOCALE_KEY, locale); } catch {}
}

export async function selectProductLocale(locale) {
  if (locale !== "en" && locale !== "ja") return;
  rememberLocale(locale);
  await saveAccountData();
  if (accountSnapshot().error) return;
  window.location.reload();
}

export const localized = (english, japanese) => productLocale() === "ja" ? japanese : english;
