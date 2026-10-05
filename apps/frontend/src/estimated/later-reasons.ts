import { productLocale } from "../i18n.ts";
import reasonCopy from "./later-reasons.json";

type Street = "turn" | "river";
type Situation = "lead" | "facing" | "facing_raise";
type Locale = "ja" | "en";
type LocalizedText = Partial<Record<Locale, string>>;
type TierTexts = Partial<Record<string, LocalizedText>>;

type LaterReasonCopy = {
  base: Record<Street, Record<Situation, Record<string, TierTexts>>>;
  texture: Record<Street, Record<string, TierTexts>>;
  line: Record<Street, Record<Situation, Record<string, LocalizedText>>>;
};

const copy = reasonCopy as unknown as LaterReasonCopy;
const leadActions: Record<string, string> = {
  check: "check",
  bet33: "bet_small",
  bet75: "bet_big",
  bet125: "bet_big",
  allin: "allin",
};

function situationForNode(node: string): Situation | undefined {
  if (node.endsWith("_first")) return "lead";
  if (/_vs_raise\d*$/.test(node)) return "facing_raise";
  if (node.includes("_vs_")) return "facing";
  return undefined;
}

function textAt(value: LocalizedText | undefined, locale: Locale) {
  const text = value?.[locale];
  return typeof text === "string" && text.trim() ? text : undefined;
}

export function laterActionReason({
  street,
  node,
  action,
  tier,
  texture,
  line,
  locale = productLocale(),
}: {
  street: Street;
  node: string;
  action: string;
  tier: string;
  texture: string;
  line: string;
  locale?: ReturnType<typeof productLocale>;
}): string {
  const situation = situationForNode(node);
  const actionKey = situation === "lead" ? leadActions[action] : action;
  const reasonTier = street === "river" && tier === "draw" ? "air" : tier;
  const localized = locale === "en" ? "en" : "ja";
  const sentences = [
    textAt(situation && actionKey ? copy.base[street]?.[situation]?.[actionKey]?.[reasonTier] : undefined, localized),
    textAt(copy.texture[street]?.[texture]?.[reasonTier], localized),
    textAt(situation ? copy.line[street]?.[situation]?.[line] : undefined, localized),
  ].filter((sentence): sentence is string => Boolean(sentence));

  return sentences.join(localized === "en" ? " " : "");
}
