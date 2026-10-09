// Short, hand-specific three-player explanations. Never borrow heads-up defence,
// opponent-equity or EV claims: describe only classified cards and saved mix context.
const descriptions = {
  en: {
    absolute_nuts: "This made hand is guaranteed not to lose on any remaining runout. Ties may occur.",
    nuts: "No legal opposing hand is stronger on the current board. Ties may occur.",
    monster: "Your private cards contribute to two pair or a stronger made hand.",
    strong: "The saved mix weighs a private pair or strong kicker against the price and players still to act.",
    draw: "Your private cards have a straight or flush draw. Completing it does not guarantee a win.",
    medium: "This hand has limited made-hand strength in the three-player range.",
    air: "This hand has no made pair or private-card straight or flush draw.",
    board_shared: "Your best five cards are the board. Other private cards may still improve on that board.",
    board_locked: "Every remaining player has the same unbeatable board hand. Players who stay in share the pot.",
  },
  ja: {
    absolute_nuts: "この完成役は、残りのカードが何でも負けません。引き分けはあり得ます。",
    nuts: "現在のボードでは、相手の合法な手に負けません。引き分けはあり得ます。",
    monster: "自分の手札がツーペア以上の完成役に使われています。",
    strong: "保存済みの方針は、自分のペアや強いキッカーを、価格と後ろに残る相手に照らして扱います。",
    draw: "自分の手札を使うストレートかフラッシュのドローがあります。完成しても必ず勝つわけではありません。",
    medium: "3人ポットのレンジの中では、完成役の強さが限られています。",
    air: "自分のペアも、手札を使うストレート・フラッシュのドローもありません。",
    board_shared: "最良の5枚はボードです。相手の手札がボードより強い役を作る可能性があります。",
    board_locked: "残っている全員が、ボード上の同じ最強の役を使います。残ったプレイヤーでポットを分けます。",
  },
  "zh-CN": {
    absolute_nuts: "无论之后出现什么牌，这副成牌都不会输，但可能平局。",
    nuts: "在当前牌面上，没有合法的对手底牌组合更强，但可能平局。",
    monster: "你的底牌参与组成两对或更强的成牌。",
    strong: "保存的策略结合跟注价格和后续对手，评估你的对子或强踢脚牌。",
    draw: "你的底牌参与顺子或同花听牌；完成听牌也不保证获胜。",
    medium: "在三人底池范围中，这手成牌的强度有限。",
    air: "这手牌没有形成对子，也没有底牌参与的顺子或同花听牌。",
    board_shared: "你最好的五张牌就是公共牌，对手的底牌仍可能组成更强的牌。",
    board_locked: "所有剩余玩家都使用公共牌上的同一副最强牌，继续参与者平分底池。",
  },
  es: {
    absolute_nuts: "Esta mano hecha no puede perder con ninguna carta que quede por salir. Puede haber empate.",
    nuts: "Ninguna mano rival legal supera a esta mano en la mesa actual. Puede haber empate.",
    monster: "Tus cartas privadas contribuyen a formar dobles parejas o una mano más fuerte.",
    strong: "La mezcla guardada pondera tu pareja o kicker fuerte frente al precio y los jugadores pendientes.",
    draw: "Tus cartas privadas tienen un proyecto de escalera o color. Completarlo no garantiza ganar.",
    medium: "Esta mano hecha tiene una fuerza limitada dentro del rango de tres jugadores.",
    air: "La mano no tiene pareja ni un proyecto privado de escalera o color.",
    board_shared: "Tus cinco mejores cartas son las de la mesa. Otras cartas privadas aún pueden mejorar esa mano.",
    board_locked: "Todos los jugadores restantes comparten la misma mano imbatible de la mesa y se reparten el bote si continúan.",
  },
};
const prefixes = { en: "In this three-player-origin pot: ", ja: "3人ポットでは、", "zh-CN": "在这个三人起始底池中：", es: "En este bote originado con tres jugadores: " };
const averages = { en: "The combinations have different strength groups. This is their path-weighted average mix.", ja: "組み合わせごとに強さの分類が異なります。表示は到達割合で重み付けした平均です。", "zh-CN": "各具体组合的牌力分类不同，显示的是按路径到达权重计算的平均策略。", es: "Las combinaciones pertenecen a distintos grupos de fuerza. Se muestra la mezcla media ponderada por su peso en la secuencia." };
const future = { en: " Later cards can change that strength.", ja: " 残りのカードで強さは変わり得ます。", "zh-CN": " 后续牌可能改变这一强度。", es: " Las cartas posteriores pueden cambiar esa fuerza." };
export function mw3HandExplanation({ tier, tiers = [], street, locale = "en" }: { tier?: keyof typeof descriptions.en | null; tiers?: (keyof typeof descriptions.en)[]; street: string; locale?: string }) {
  const lang = (Object.hasOwn(descriptions, locale) ? locale : "en") as keyof typeof descriptions;
  if (!tier && new Set(tiers).size !== 1) return prefixes[lang] + averages[lang];
  const current = tier ?? tiers[0], text = descriptions[lang][current];
  if (!text) throw new Error("Unknown three-player hand strength");
  return prefixes[lang] + text + (current === "nuts" && street !== "river" ? future[lang] : "");
}
