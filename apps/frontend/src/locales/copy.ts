import dictionary from "./product-dictionary.json" with { type: "json" };
import direct from "./product-direct.json" with { type: "json" };

// Authored interface copy only. Interpolated values are kept verbatim: never
// translate user names, saved drill names, cards or numerical strategy facts.
export const productCopy: Record<string, string[]> = { ...dictionary, ...direct };
const caseInsensitiveCopy = new Map(Object.entries(productCopy).filter(([key]) => !/\{\d+\}/.test(key)).map(([key, translations]) => [key.toLowerCase(), translations]));
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.entries(productCopy).filter(([key]) => /\{\d+\}/.test(key)).map(([key, values]) => {
  const indexes: number[] = [];
  const pieces = key.split(/(\{\d+\})/g).map(part => {
    const slot = /^\{(\d+)\}$/.exec(part);
    if (!slot) return escape(part);
    indexes.push(Number(slot[1]));
    return "([\\s\\S]*?)";
  });
  return { key, values, indexes, expression: new RegExp(`^${pieces.join("")}$`) };
}).sort((a, b) => b.key.replace(/\{\d+\}/g, "").length - a.key.replace(/\{\d+\}/g, "").length);

export function translateLocaleCopy(value: string, locale: string): string {
  const index = locale === "zh-CN" ? 0 : locale === "es" ? 1 : -1;
  if (index < 0 || typeof value !== "string") return value;
  const exact = (productCopy[value] ?? caseInsensitiveCopy.get(value.toLowerCase()))?.[index];
  if (exact !== undefined) return exact;
  for (const { expression, indexes, values } of patterns) {
    const match = expression.exec(value);
    if (!match) continue;
    const slots = new Map(indexes.map((slot, i) => [slot, match[i + 1]]));
    return values[index].replace(/\{(\d+)\}/g, (_, slot) => slots.get(Number(slot)) ?? "");
  }
  return value;
}
