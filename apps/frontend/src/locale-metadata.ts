// Pure metadata shared by the product and service site.
export type ProductLocale = "en" | "ja" | "zh-CN" | "es";
export const LOCALES = [
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "zh-CN", label: "简体中文" },
  { value: "es", label: "Español" },
] as const;
export const isProductLocale = (locale: unknown): locale is ProductLocale => LOCALES.some(item => item.value === locale);
