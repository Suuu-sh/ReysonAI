// Evion Agent tables and their monster characters. Names are flavour only: every agent plays
// the same Evion solver estimate (and, later, the same opponent-adjusted tables).
export type AgentCharacter = { id: string; name: { ja: string; en: string }; species: { ja: string; en: string }; color: string };
export type AgentTable = { id: string; name: { ja: string; en: string }; tagline: { ja: string; en: string }; theme: string; agents: AgentCharacter[] };

const agent = (id: string, ja: string, en: string, speciesJa: string, speciesEn: string, color: string): AgentCharacter =>
  ({ id, name: { ja, en }, species: { ja: speciesJa, en: speciesEn }, color });

export const AGENT_TABLES: AgentTable[] = [
  { id: "mochi-forest", name: { ja: "もちもち森", en: "Mochi Forest" }, tagline: { ja: "やわらかい仲間たちの、のんびりした卓", en: "A soft, easygoing forest table" }, theme: "#7fc98f", agents: [
    agent("mochi", "モチ", "Mochi", "スライム", "slime", "#9be3b0"),
    agent("poko", "ポコ", "Poko", "きのこ", "mushroom", "#f08a7e"),
    agent("lulu", "ルル", "Lulu", "うさぎ竜", "bunny dragon", "#c7a6ff"),
    agent("donk", "ドンク", "Donk", "どんぐり鬼", "acorn imp", "#c99a62"),
    agent("nemu", "ネム", "Nemu", "ねむりフクロウ", "sleepy owl", "#a9b8d6"),
  ] },
  { id: "stardust-lake", name: { ja: "ほしくず湖", en: "Stardust Lake" }, tagline: { ja: "星あかりの湖のほとりで一局", en: "A game by the starlit lake" }, theme: "#6fb7e8", agents: [
    agent("kira", "キラ", "Kira", "星クラゲ", "star jelly", "#ffd56b"),
    agent("pichi", "ピチ", "Pichi", "しずく", "droplet", "#7fd3f7"),
    agent("gabu", "ガブ", "Gabu", "ちびワニ", "tiny croc", "#79c27a"),
    agent("mofu", "モフ", "Mofu", "くも羊", "cloud sheep", "#e8e8f2"),
    agent("sora", "ソラ", "Sora", "ちびクジラ", "baby whale", "#6f9cf0"),
  ] },
  { id: "ember-peak", name: { ja: "ほのお山", en: "Ember Peak" }, tagline: { ja: "火山のふもとの、熱い卓", en: "A hot table below the volcano" }, theme: "#f08a5d", agents: [
    agent("bomu", "ボム", "Bomu", "ばくだん虫", "bomb bug", "#5d5d6e"),
    agent("chili", "チリ", "Chili", "とうがらし竜", "chili dragon", "#f0605d"),
    agent("goro", "ゴロ", "Goro", "いわ亀", "rock turtle", "#a8a29a"),
    agent("hino", "ヒノ", "Hino", "ひのたま", "fireball", "#ffa54a"),
    agent("garuru", "ガルル", "Garuru", "ちびオオカミ", "wolf pup", "#8f9bb3"),
  ] },
];

// Fills the empty sixth seat when only agents play.
export const GUEST_AGENT = agent("evi", "エビ", "Evi", "スペードの妖精", "spade sprite", "#f0609e");

export const agentTableById = (id: string) => AGENT_TABLES.find(table => table.id === id) ?? null;
