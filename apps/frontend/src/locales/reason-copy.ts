import secondary from "./reasons-secondary.json" with { type: "json" };
import primary from "./reasons-primary.json" with { type: "json" };
import { productCopy, translateLocaleCopy } from "./copy.ts";

// These templates only receive text produced by the explanation generators.
// Do not call this with user-authored text or mutate any stored strategy data.
const words: Record<string, string[]> = {
  above: ["高于", "por encima"], below: ["低于", "por debajo"],
  open: ["开池", "abrir"], limp: ["溜入", "limp"], check: ["过牌", "pasar"], raise: ["加注", "subir"], call: ["跟注", "pagar"], fold: ["弃牌", "retirarse"],
  deuce: ["2", "dos"], three: ["3", "tres"], four: ["4", "cuatro"], five: ["5", "cinco"], six: ["6", "seis"], seven: ["7", "siete"], eight: ["8", "ocho"], nine: ["9", "nueve"], ten: ["T", "diez"], jack: ["J", "jota"], queen: ["Q", "reina"], king: ["K", "rey"], ace: ["A", "as"],
  deuces: ["2", "doses"], threes: ["3", "treses"], fours: ["4", "cuatros"], fives: ["5", "cincos"], sixes: ["6", "seises"], sevens: ["7", "sietes"], eights: ["8", "ochos"], nines: ["9", "nueves"], tens: ["T", "dieces"], jacks: ["J", "jotas"], queens: ["Q", "reinas"], kings: ["K", "reyes"], aces: ["A", "ases"],
  trips: ["三条", "trío"], quads: ["四条", "póquer"], no: ["零", "ninguna"], one: ["一", "una"], two: ["二", "dos"],
};
export const reasonCopy: Record<string, string[]> = { ...productCopy, ...primary, ...secondary, ...words };
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const templates = Object.entries({ ...primary, ...secondary }).filter(([key]) => /\{\d+\}/.test(key) && /[a-z]{2}/i.test(key.replace(/\{\d+\}/g, ""))).map(([key, values]) => {
  const slots: number[] = [];
  const expression = key.split(/(\{\d+\})/g).map(part => {
    const slot = /^\{(\d+)\}$/.exec(part);
    if (!slot) return escape(part);
    slots.push(Number(slot[1]));
    return "([\\s\\S]*?)";
  }).join("");
  return { key, values, slots, expression: new RegExp(`^${expression}$`, "i") };
}).sort((a, b) => b.key.replace(/\{\d+\}/g, "").length - a.key.replace(/\{\d+\}/g, "").length);

export function translateExplanationCopy(value: string, locale: string, depth = 0): string {
  const index = locale === "zh-CN" ? 0 : locale === "es" ? 1 : -1;
  if (index < 0 || !value || depth > 16) return value;
  // Card/seat identifiers and numerical facts are not prose. This also keeps
  // matrix-cell observation cheap when hundreds of unchanged labels update.
  if (/^(?:[2-9TJQKA]{2}[so]?|(?:[2-9TJQKA][♣♦♥♠])+|UTG|HJ|CO|BTN|SB|BB|[\d.,+% −–—]+)$/.test(value)) return value;
  const exact = reasonCopy[value] ?? reasonCopy[value[0].toLowerCase() + value.slice(1)];
  if (exact) return exact[index];
  const translate = (text: string) => translateExplanationCopy(text, locale, depth + 1);
  // Split generator sentences before matching templates. Decimal facts, card
  // notation and punctuation within a sentence are left intact.
  const sentences = value.split(/(?<=[.!?])\s+(?=[A-Z])/);
  if (sentences.length > 1) return sentences.map(translate).join(locale === "zh-CN" ? "" : " ");
  for (const { expression, slots, values } of templates) {
    const match = expression.exec(value);
    if (!match) continue;
    const captures = new Map(slots.map((slot, i) => [slot, translate(match[i + 1])]));
    return values[index].replace(/\{(\d+)\}/g, (_, slot) => captures.get(Number(slot)) ?? "");
  }
  for (const [delimiter, translated] of [["; ", locale === "zh-CN" ? "；" : "; "], [", ", locale === "zh-CN" ? "、" : ", "], [" and ", locale === "zh-CN" ? "和" : " y "], [" or ", locale === "zh-CN" ? "或" : " o "], [": ", locale === "zh-CN" ? "：" : ": "]]) {
    if (value.includes(delimiter)) return value.split(delimiter).map(translate).join(translated);
  }
  const frequency = /^(.*?) (\d+(?:\.\d+)?%)$/.exec(value);
  if (frequency) return `${translate(frequency[1])} ${frequency[2]}`;
  const article = /^(?:a|an|the) (.*)$/i.exec(value);
  if (article) { const result = translate(article[1]); if (result !== article[1]) return result; }
  const punctuation = /^(.*?)([.])$/.exec(value);
  if (punctuation) { const result = translate(punctuation[1]); if (result !== punctuation[1]) return result + (locale === "zh-CN" ? "。" : "."); }
  return translateLocaleCopy(value, locale);
}

export type NarrativeLanguage = boolean | "en" | "zh-CN" | "es";

// Used at the authored template boundary, before placeholders are interpolated.
// This preserves nested explanation structure and avoids guessing sentence parts.
export function narrative(template: string, values: unknown[], language: NarrativeLanguage, context = ""): string {
  const locale = language === "zh-CN" || language === "es" ? language : "en";
  const index = locale === "zh-CN" ? 0 : locale === "es" ? 1 : -1;
  const translated = index < 0 ? template : reasonCopy[context ? `${context}|${template}` : template]?.[index] ?? template;
  return translated.replace(/\{(\d+)\}/g, (_, slot) => {
    const value = String(values[Number(slot)] ?? "");
    return index < 0 ? value : translateExplanationCopy(value, locale);
  });
}
