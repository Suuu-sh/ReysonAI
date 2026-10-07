// Read-only audit oracle. Deliberately imports neither the production evaluator,
// features, nor copy builder: rendered assertions are checked against cards.
const RANKS = "23456789TJQKA", SUITS = "cdhs";
const CATEGORIES = ["highCard", "pair", "twoPair", "trips", "straight", "flush", "fullHouse", "quads", "straightFlush"];
const WORDS = ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "jack", "queen", "king", "ace"];
export const FINDING_KINDS = ["tier-mismatch", "beats-claim", "made-hand-wrong", "draw-wrong", "number-wrong", "forbidden", "locale-leak", "empty-or-generic"];

export function parseOracleCards(input) {
  if (Array.isArray(input)) return input.map(c => typeof c === "number" ? c : parseOracleCards(c)[0]);
  const text = String(input ?? "").replace(/10/g, "T").replace(/[♣♦♥♠]/g, s => SUITS["♣♦♥♠".indexOf(s)]).replace(/[\s,]/g, "");
  if (!/^(?:[2-9TJQKA][cdhs])+$/i.test(text)) throw new Error(`Invalid oracle card notation: ${text}`);
  return text.match(/../g).map(c => RANKS.indexOf(c[0].toUpperCase()) * 4 + SUITS.indexOf(c[1].toLowerCase()));
}
const categoryOf = score => Math.floor(score / 16 ** 5);
const pack = (category, ranks) => [category, ...ranks, ...Array(5).fill(0)].slice(0, 6).reduce((v, r) => v * 16 + r, 0);
const straightRanks = high => high === 3 ? [3, 2, 1, 0, 12] : [high, high - 1, high - 2, high - 3, high - 4];
function straightHigh(ranks) {
  const seen = new Set(ranks);
  for (let high = 12; high >= 3; high--) if (straightRanks(high).every(r => seen.has(r))) return high;
  return -1;
}

// Construct the actual best five, including kickers, from count/suit groups.
export function evaluateBest(input) {
  const cards = parseOracleCards(input);
  if (cards.length < 5 || cards.length > 7 || new Set(cards).size !== cards.length || cards.some(c => !Number.isInteger(c) || c < 0 || c > 51)) throw new Error("Oracle requires 5-7 distinct cards");
  const groups = Array.from({ length: 13 }, () => []), suits = Array.from({ length: 4 }, () => []);
  for (const c of cards) { groups[c >> 2].push(c); suits[c & 3].push(c); }
  const available = groups.map((g, r) => g.length ? r : -1).filter(r => r >= 0).sort((a, b) => b - a);
  const withCount = n => available.filter(r => groups[r].length >= n);
  const flush = suits.find(s => s.length >= 5)?.sort((a, b) => b - a);
  let category, ranks, chosen;
  const sf = flush ? straightHigh(flush.map(c => c >> 2)) : -1;
  if (sf >= 0) { category = 8; ranks = [sf]; chosen = straightRanks(sf).map(r => flush.find(c => c >> 2 === r)); }
  else if (withCount(4).length) {
    category = 7; const q = withCount(4)[0], k = available.find(r => r !== q);
    ranks = [q, k]; chosen = [...groups[q], groups[k][0]];
  } else if (withCount(3).length && withCount(2).some(r => r !== withCount(3)[0])) {
    category = 6; const t = withCount(3)[0], p = withCount(2).find(r => r !== t);
    ranks = [t, p]; chosen = [...groups[t].slice(0, 3), ...groups[p].slice(0, 2)];
  } else if (flush) { category = 5; chosen = flush.slice(0, 5); ranks = chosen.map(c => c >> 2); }
  else if (straightHigh(available) >= 0) {
    category = 4; const high = straightHigh(available); ranks = [high]; chosen = straightRanks(high).map(r => groups[r][0]);
  } else if (withCount(3).length) {
    category = 3; const t = withCount(3)[0], kickers = available.filter(r => r !== t).slice(0, 2);
    ranks = [t, ...kickers]; chosen = [...groups[t].slice(0, 3), ...kickers.map(r => groups[r][0])];
  } else if (withCount(2).length >= 2) {
    category = 2; const pairs = withCount(2).slice(0, 2), k = available.find(r => !pairs.includes(r));
    ranks = [...pairs, k]; chosen = [...pairs.flatMap(r => groups[r].slice(0, 2)), groups[k][0]];
  } else if (withCount(2).length) {
    category = 1; const p = withCount(2)[0], ks = available.filter(r => r !== p).slice(0, 3);
    ranks = [p, ...ks]; chosen = [...groups[p].slice(0, 2), ...ks.map(r => groups[r][0])];
  } else { category = 0; ranks = available.slice(0, 5); chosen = ranks.map(r => groups[r][0]); }
  return { score: pack(category, ranks), category: CATEGORIES[category], categoryIndex: category, ranks, cards: chosen };
}

const cache = new Map();
export function enumerateOpponentOracle(combo, boardInput) {
  const hole = parseOracleCards(combo), board = parseOracleCards(boardInput), all = [...hole, ...board];
  if (hole.length !== 2 || board.length < 3 || board.length > 5 || new Set(all).size !== all.length) throw new Error("Invalid oracle hand/board");
  const key = `${hole.slice().sort((a, b) => a - b)}|${board.slice().sort((a, b) => a - b)}`;
  if (cache.has(key)) return cache.get(key);
  const made = evaluateBest(all), boardRanks = [...new Set(board.map(c => c >> 2))].sort((a, b) => b - a), top = boardRanks[0];
  const bc = r => board.filter(c => c >> 2 === r).length;
  const heroPairRanks = made.categoryIndex === 1 || made.categoryIndex === 3 || made.categoryIndex === 7 ? made.ranks.slice(0, 1) : made.categoryIndex === 2 || made.categoryIndex === 6 ? made.ranks.slice(0, 2) : [];
  // A pocket pair still supplies the reference rank after upgrading to a set,
  // full house or flush. Its named lower-pair class must retain *their* upgrades.
  const heroOwnPair = hole[0] >> 2 === hole[1] >> 2 ? hole[0] >> 2 : heroPairRanks.find(r => hole.some(c => c >> 2 === r));
  const remaining = Array.from({ length: 52 }, (_, c) => c).filter(c => !all.includes(c));
  // loser = opponent loses to hero; other = opponent wins OR ties.
  const tally = Object.fromEntries([...CATEGORIES, "topPair", "underpair", "overpair", "lowerPair", "set"].map(k => [k, { loser: 0, other: 0 }]));
  let winners = 0, ties = 0, losers = 0;
  const beaters = [];
  for (let i = 0; i < remaining.length; i++) for (let j = i + 1; j < remaining.length; j++) {
    const opponent = [remaining[i], remaining[j]], result = evaluateBest([...opponent, ...board]), side = result.score < made.score ? "loser" : "other";
    tally[result.category][side]++;
    const [a, b] = opponent.map(c => c >> 2);
    // Shape classes deliberately retain flush/full-house upgrades (A3/A6).
    if (a !== b && (a === top || b === top)) tally.topPair[side]++;
    if (a === b && !bc(a)) tally[a > top ? "overpair" : "underpair"][side]++;
    if (a === b && bc(a) === 1) tally.set[side]++;
    const ownPairRanks = [...new Set([a, b])].filter(r => (a === b ? 2 : 1) + bc(r) >= 2);
    if (heroOwnPair !== undefined ? ownPairRanks.length && Math.max(...ownPairRanks) < heroOwnPair : result.categoryIndex === 1) tally.lowerPair[side]++;
    if (result.score > made.score) { winners++; beaters.push({ combo: opponent, category: result.category }); }
    else if (result.score === made.score) ties++; else losers++;
  }
  const playsBoard = board.length === 5 && made.score === evaluateBest(board).score;
  const madeRanks = made.categoryIndex === 1 ? made.ranks.slice(0, 1) : made.categoryIndex === 2 || made.categoryIndex === 6 ? made.ranks.slice(0, 2) : made.categoryIndex === 3 || made.categoryIndex === 7 ? made.ranks.slice(0, 1) : [];
  const holeMadeRanks = [...new Set(hole.map(c => c >> 2).filter(r => madeRanks.includes(r)))];
  const result = { hole, board, made, playsBoard, holeMadeRanks, tally, winners, ties, losers, beaters, total: winners + ties + losers, remaining };
  if (cache.size >= 256) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return result;
}

export function oracleDraws(oracle) {
  const { hole, board, made, remaining } = oracle;
  const ranks = new Set(); let clean = 0, dirty = 0, flushOuts = 0;
  if (board.length === 5) return { ranks: [], clean, dirty, flushOuts };
  for (const card of remaining) {
    const next = evaluateBest([...hole, ...board, card]);
    const nextBoard = [...board, card], suitCount = s => nextBoard.filter(c => (c & 3) === s).length;
    if (made.categoryIndex < 4 && next.categoryIndex === 4) {
      // Board-only completions do not improve our holding (A4).
      if (nextBoard.length === 5 && evaluateBest(nextBoard).score >= next.score) continue;
      ranks.add(card >> 2);
      if ([0, 1, 2, 3].some(s => suitCount(s) >= 3)) dirty++; else clean++;
    }
    if (made.categoryIndex < 5 && (next.categoryIndex === 5 || next.categoryIndex === 8) && next.cards.some(c => hole.includes(c))) flushOuts++;
  }
  return { ranks: [...ranks].sort((a, b) => a - b), clean, dirty, flushOuts };
}

// Model's *documented tier contract*, not made-strength/percentile. Runner should
// supply expectedTier = handTier(...) to compare literally with the UI tier.
export function oracleTier(combo, boardInput) {
  const hole = parseOracleCards(combo), board = parseOracleCards(boardInput), result = evaluateBest([...hole, ...board]);
  if (result.categoryIndex > 3) return "monster";
  const hr = hole.map(c => c >> 2), top = Math.max(...board.map(c => c >> 2));
  const made = result.categoryIndex === 0 ? [] : [...new Set(hr)].filter(r => [...hole, ...board].filter(c => c >> 2 === r).length >= 2);
  if (made.length >= 2 || made.some(r => [...hole, ...board].filter(c => c >> 2 === r).length >= 3)) return "monster";
  if (made.length === 1 && (made[0] === top || hr[0] === hr[1] && hr[0] > top)) return "strong";
  if (board.length < 5) {
    const all = [...hole, ...board], ranks = all.map(c => c >> 2);
    if ([0, 1, 2, 3].some(s => all.filter(c => (c & 3) === s).length === 4 && hole.some(c => (c & 3) === s))) return "draw";
    for (let high = 3; high <= 12; high++) {
      const window = straightRanks(high);
      if (window.filter(r => ranks.includes(r)).length === 4 && hr.some(r => window.includes(r))) return "draw";
    }
  }
  return made.length ? "medium" : "air";
}

function strings(value, path = "rendered") {
  if (typeof value === "string") return [{ path, text: value }];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, v]) => strings(v, `${path}.${key}`));
}
const sentences = text => text.split(/(?<!\d)[.!?。！？;；\n]+/).map(t => t.trim()).filter(Boolean);
const negative = (text, start, end) => /(?:\b(?:no|not|without|never|cannot|can't|doesn't|don't|isn't|aren't|lacks|rather than|instead of)\b[^,;:]{0,35})$/i.test(text.slice(0, start)) || /^(?:\s*(?:is|are|does)?\s*(?:not|never)\b)|^[^、。]{0,14}(?:ない|なく|ません|ではなく)/.test(text.slice(end));
const escaped = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function heroAssertion(text, path, start, combo) {
  const prefix = text.slice(0, start);
  // An earlier "X has a full house" does not make every later noun a claim
  // about X: paying classes, threats and range commentary start new clauses.
  if (/(?:paid by|get(?:s)? (?:paid|calls)|calls? from|\b(?:beats?|ahead of|outdraw|overtake|because|though|although|risks?|denies)\b|:\s*it\b|相手|ですが|だから|なので|のため|ので|には|に無料|から見る|逆転|上回り)/i.test(prefix) || /[,、;]/.test(prefix)) return false;
  if (/は[^。]*で/.test(prefix)) return false;
  // A hand-copy descriptor is direct, but opponent/range/blocker context isn't.
  if (/opponent|defender|bettor|opposing|相手|ブロック|block|board texture|ボード構造/i.test(prefix) && !/\b(?:you|your hand)\b|自分|手札/.test(prefix.slice(-35))) return false;
  if (/\b(?:range|hands|holdings)\b|レンジ|相手の手/i.test(prefix) && !/\b(?:you|your hand)\b|自分|手札/.test(prefix.slice(-35))) return false;
  if (/handCopy\.(?:made|has|short|tag|standing|draw|backdoor)$/.test(path)) return true;
  if (/\b(?:you (?:hold|have)|your (?:hand|holding)|this hand (?:is|has)|we (?:hold|have))\b|この手(?:は|が)|手札(?:は|が)|自分(?:は|の手は)/i.test(prefix)) return true;
  const cardPrefix = prefix.replace(/[♣♦♥♠]/g, s => SUITS["♣♦♥♠".indexOf(s)]).replace(/10/g, "T");
  if (combo && new RegExp(`${escaped(String(combo))}\\s*(?:is|has|holds|:|は)`, "i").test(cardPrefix)) return true;
  // Average display names ("A4s is...") are hand notation, not the raw representative.
  if (/^(?:[2-9TJQKA][cdhs]){2}\s+(?:is|has|holds)|^[2-9TJQKA]{2}[so]?\s*(?:is|has|holds|は)/i.test(cardPrefix)) return true;
  return /headline|handCopy/.test(path) && start < 8;
}
const CLASS_PATTERNS = [
  ["topPair", /top[- ]pair|トップペア/ig], ["overpair", /overpairs?|オーバーペア/ig], ["underpair", /underpairs?|アンダーペア/ig],
  ["lowerPair", /lower pairs?|下位のペア/ig], ["pair", /one[- ]pair(?: hands)?|ワンペア/ig],
  ["twoPair", /(?:weaker |lower )?two pair|(?:劣る|下位の)?ツーペア/ig], ["set", /\bsets?\b|セット/ig], ["trips", /\btrips\b|トリップス/ig],
  ["straight", /(?:weaker |lower )?straights?(?![- ]?flush| draw)|(?<!フラッシュ)ストレート(?!フラッシュ|ドロー)/ig],
  ["flush", /(?:weaker |lower )?flush(?:es)?(?! draw)|(?<!ストレート)フラッシュ(?!ドロー)/ig],
  ["fullHouse", /(?:lower |weaker )?full houses?|(?:劣る|下位の)?フルハウス/ig], ["quads", /(?:lower )?quads|フォーカード/ig],
];
const MADE_PATTERNS = [
  ["straightFlush", /straight flush|ストレートフラッシュ/ig], ["fullHouse", /full house|フルハウス/ig], ["quads", /\bquads\b|four of a kind|フォーカード/ig],
  ["flush", /(?<!straight )\bflush\b(?! draw)|(?<!ストレート)フラッシュ(?!ドロー)/ig],
  ["straight", /\bstraight\b(?! flush| draw)|ストレート(?!フラッシュ|ドロー)/ig], ["trips", /\b(?:set|trips)\b|セット|トリップス/ig],
  ["twoPair", /(?:top |lower )?two pair|(?:トップ|下位の)?ツーペア/ig],
  ["pair", /\b(?:overpair|underpair|top pair|second pair|bottom pair|one-pair)\b|オーバーペア|アンダーペア|トップペア|セカンドペア|ボトムペア|ワンペア/ig],
];
const TIER_PATTERNS = [
  ["monster", /\bmonster(?: hand)?\b|\bvery strong made hand\b|とても強い完成役|モンスター/ig],
  ["strong", /\bstrong (?:pair|made hand|hand)\b|強いペア|強い完成役/ig],
  ["medium", /\b(?:medium(?: strength)? (?:pair|hand)|weak pair)\b|弱いペア|中程度の(?:ペア|手)/ig],
  ["air", /\b(?:air|unpaired high cards|no made hand)\b|役なし/ig],
];
function rankNumber(word) {
  const raw = word.trim().toLowerCase();
  if (raw === "deuce" || raw === "deuces") return 0;
  if (raw === "sixes") return 4;
  const singular = raw.replace(/s$/, "");
  return WORDS.includes(singular) ? WORDS.indexOf(singular) : RANKS.indexOf(raw === "10" ? "T" : raw.toUpperCase());
}

export function auditExplanationCase(input) {
  const representative = input.combo ?? input.cards ?? input.representativeCombo;
  const oracle = enumerateOpponentOracle(representative, input.board), draws = oracleDraws(oracle);
  const entries = strings(input.rendered), findings = [], seen = new Set();
  const add = (kind, message, excerpt = "", expected, actual) => {
    const key = `${kind}|${message}|${excerpt}`; if (seen.has(key)) return; seen.add(key);
    findings.push({ kind, message, excerpt, ...(expected === undefined ? {} : { expected }), ...(actual === undefined ? {} : { actual }) });
  };
  let expectedTier = input.expectedTier;
  if (!expectedTier && input.selection === "hand-class-average" && input.combos?.length) {
    const weights = new Map();
    for (const { cards, weight = 1 } of input.combos) {
      const tier = oracleTier(cards, oracle.board); weights.set(tier, (weights.get(tier) ?? 0) + weight);
    }
    expectedTier = [...weights].sort((a, b) => b[1] - a[1])[0][0];
  }
  expectedTier ??= oracleTier(oracle.hole, oracle.board);
  const observedTier = input.observedTier ?? input.decision?.tier;
  if (observedTier && observedTier !== expectedTier) add("tier-mismatch", "Displayed/computed tier differs from handTier for this combo", String(observedTier), expectedTier, observedTier);
  const nonempty = entries.filter(x => x.text.trim());
  if (!nonempty.length) add("empty-or-generic", "No rendered explanation text");
  const reasons = input.rendered?.actionReasons ?? [];
  if (reasons.length > 1 && reasons.every(r => r.text?.trim() && r.text.trim() === reasons[0].text?.trim())) add("empty-or-generic", "Distinct actions repeat exactly the same reason", reasons[0].text);
  for (const entry of entries) {
    const { text, path } = entry;
    if (/headline|actionReasons\.\d+\.text/.test(path) && !text.trim()) add("empty-or-generic", "Required rendered explanation is empty", path);
    if (/^(?:AI[- ]estimated strategy\.?|Follow the saved (?:strategy|mix)\.?|The strategy recommends this action\.?|推定戦略です[。]?|保存された戦略に従います[。]?)$/i.test(text.trim())) add("empty-or-generic", "Explanation gives no hand-specific reason", text);
    if (input.locale === "en" && /[\u3040-\u30ff\u3400-\u9fff]/.test(text)) add("locale-leak", "Japanese text in English rendered explanation", text);
    if (input.locale === "ja") {
      const clean = text.replace(/\b(?:[2-9TJQKA][cdhs]){1,5}\b|\b[2-9TJQKA]{2}[so]?\b|\b(?:UTG|HJ|CO|BTN|SB|BB|IP|OOP|SPR|MDF|EV|GTO|AI|Check|Bet|Raise|Fold|Call|All-in)\b|\d+(?:\.\d+)?\s*(?:%|bb|BB)/g, "");
      if (/\b[A-Za-z]{2,}(?:[ -]+[A-Za-z]{2,}){2,}\b/.test(clean)) add("locale-leak", "Untranslated English sentence in Japanese rendered explanation", text);
    }
    for (const sentence of sentences(text)) {
      for (const [tier, pattern] of TIER_PATTERNS) for (const m of sentence.matchAll(pattern)) {
        if (tier === "strong" && /very\s+$|とても$/.test(sentence.slice(0, m.index))) continue;
        if (!negative(sentence, m.index, m.index + m[0].length) && heroAssertion(sentence, path, m.index, input.combo) && tier !== expectedTier) add("tier-mismatch", "Hero strength tier in rendered text differs from handTier", sentence, expectedTier, tier);
      }
      if (/\bEV\s*(?:[:=]|(?:is|of)\s+)?[+−-]?\d|[+−-]?\d+(?:\.\d+)?\s*(?:bb\s*)?EV\b|(?:期待値|EV)[^。]{0,8}[+−-]?\d/i.test(sentence)) add("forbidden", "Numeric EV is forbidden in postflop copy", sentence);
      const forbidden = /\b(?:GTO|solver(?:[- ](?:output|approved|derived))?|optimal|optimally)\b|最適|ソルバー/ig;
      for (const m of sentence.matchAll(forbidden)) if (!negative(sentence, m.index, m.index + m[0].length) && !/not .*solver|not .*GTO|GTOでは|ソルバー.{0,8}では|最適.{0,5}では/i.test(sentence)) add("forbidden", "Affirmative GTO/solver/optimal claim", sentence);
      // Named hands must *actually* mostly lose, including ties on the other side.
      const pay = /(?:paid by|get(?:s)? (?:paid|calls) (?:by|from)|calls? from|beats?|ahead of|負かせる|から(?:コール|支払))\s*/ig;
      for (const m of sentence.matchAll(pay)) {
        if (negative(sentence, m.index, m.index + m[0].length)) continue;
        const span = sentence.slice(m.index + m[0].length).split(/\b(?:but|though|although|whereas)\b|しかし|ただし/)[0];
        for (const [cls, pattern] of CLASS_PATTERNS) for (const named of span.matchAll(pattern)) {
          if (negative(span, named.index, named.index + named[0].length)) continue;
          const counts = oracle.tally[cls];
          if (!(counts.loser > counts.other)) add("beats-claim", `Named ${cls} holdings do not mostly lose to this hand`, sentence, "losing combos > winning + tied combos", counts);
        }
      }
      // Japanese places the opponent class before the paying/winning verb.
      for (const paid of sentence.matchAll(/から払ってもら|に払ってもら|が払ってくれる|には勝って|に勝てる|を負かせる/g)) {
        if (/ない|ません/.test(sentence.slice(paid.index, paid.index + 25))) continue;
        const prefix = sentence.slice(0, paid.index), boundary = Math.max(prefix.lastIndexOf("、"), prefix.lastIndexOf("："), prefix.lastIndexOf("で"));
        const span = prefix.slice(boundary + 1);
        for (const [cls, pattern] of CLASS_PATTERNS) for (const named of span.matchAll(pattern)) {
          if (negative(span, named.index, named.index + named[0].length)) continue;
          const counts = oracle.tally[cls];
          if (!(counts.loser > counts.other)) add("beats-claim", `Named ${cls} holdings do not mostly lose to this hand`, sentence, "losing combos > winning + tied combos", counts);
        }
      }
      for (const [cls, pattern] of MADE_PATTERNS) for (const m of sentence.matchAll(pattern)) {
        if (negative(sentence, m.index, m.index + m[0].length) || !heroAssertion(sentence, path, m.index, input.combo)) continue;
        // Embedded pair word in two-pair / tier's "or better" is not a one-pair assertion.
        if (cls === "pair" && /two pair|ツーペア|or better|以上/.test(sentence)) continue;
        if (oracle.made.category !== cls) add("made-hand-wrong", `Asserted ${cls}, actual best five is ${oracle.made.category}`, sentence, oracle.made, cls);
        const hr = oracle.hole.map(c => c >> 2), br = [...new Set(oracle.board.map(c => c >> 2))].sort((a, b) => b - a), pocket = hr[0] === hr[1], rank = oracle.made.ranks[0];
        if (cls === "pair" && oracle.made.categoryIndex === 1) {
          const own = hr.includes(rank), boardCount = oracle.board.filter(c => c >> 2 === rank).length;
          const subtype = pocket && !boardCount ? rank > br[0] ? "overpair" : "underpair" : own ? br.indexOf(rank) === 0 ? "topPair" : br.indexOf(rank) === 1 ? "secondPair" : "bottomPair" : "boardPair";
          const asserted = /overpair|オーバーペア/i.test(m[0]) ? "overpair" : /underpair|アンダーペア/i.test(m[0]) ? "underpair" : /top pair|トップペア/i.test(m[0]) ? "topPair" : /second pair|セカンドペア/i.test(m[0]) ? "secondPair" : /bottom pair|ボトムペア/i.test(m[0]) ? "bottomPair" : null;
          if (asserted && asserted !== subtype) add("made-hand-wrong", "Pair subtype does not match selected pair/private-card participation", sentence, subtype, asserted);
        }
        if (cls === "trips" && oracle.made.categoryIndex === 3) {
          const subtype = pocket && hr[0] === rank ? "set" : hr.includes(rank) ? "trips" : "boardTrips";
          const asserted = /\bset\b|セット/.test(m[0]) ? "set" : "trips";
          if (asserted !== subtype && !(subtype === "boardTrips" && /only.{0,25}board|ボード.{0,12}だけ/.test(sentence))) add("made-hand-wrong", "Set/trips subtype does not match private cards in the selected trip rank", sentence, subtype, asserted);
        }
        if (cls === "twoPair" && /top two pair|トップツーペア|トップペアを含むツーペア|two pair with the top pair/.test(sentence) && (oracle.holeMadeRanks.length !== 2 || !oracle.holeMadeRanks.includes(Math.max(...oracle.board.map(c => c >> 2))))) add("made-hand-wrong", "Counterfeited/board-dependent pairs described as own top two pair", sentence, oracle.made.ranks.slice(0, 2), oracle.holeMadeRanks);
        if (cls === "twoPair" && /top two pair|トップツーペア/.test(m[0]) && oracle.holeMadeRanks.some(r => !br.slice(0, 2).includes(r))) add("made-hand-wrong", "Own two pairs are not the top two board ranks", sentence, br.slice(0, 2), oracle.holeMadeRanks);
        if ((cls === "twoPair" || cls === "trips") && /only.{0,25}(?:on the board|board's)|ボード.{0,15}だけ/.test(sentence) && oracle.holeMadeRanks.length) add("made-hand-wrong", "Board-only descriptor ignores private cards improving the made ranks", sentence, oracle.holeMadeRanks);
      }
      // Explicit named ranks are checked against the actual selected five.
      const rankPair = /two pair\s*\(([^)]+)\)|([2-9TJQKA]|10)と([2-9TJQKA]|10)のツーペア/ig;
      for (const m of sentence.matchAll(rankPair)) if (heroAssertion(sentence, path, m.index, input.combo) && !negative(sentence, m.index, m.index + m[0].length)) {
        const named = m[1] ? m[1].split(/\s+and\s+/i).map(x => rankNumber(x.trim())) : [rankNumber(m[2]), rankNumber(m[3])];
        if (named.length === 2 && named.every(r => r >= 0) && named.some(r => !oracle.made.ranks.slice(0, 2).includes(r))) add("made-hand-wrong", "Named pair ranks are not the evaluated two pairs", sentence, oracle.made.ranks.slice(0, 2), named);
      }
      for (const m of sentence.matchAll(/\bset of (twos|deuces|threes|fours|fives|sixes|sevens|eights|nines|tens|jacks|queens|kings|aces)\b|([2-9TJQKA]|10)\2のセット/ig)) {
        if (!heroAssertion(sentence, path, m.index, input.combo) || negative(sentence, m.index, m.index + m[0].length)) continue;
        const rank = rankNumber(m[1] ?? m[2]);
        if (oracle.made.categoryIndex !== 3 || oracle.made.ranks[0] !== rank) add("made-hand-wrong", "Named set rank differs from the actual selected five", sentence, oracle.made, RANKS[rank]);
      }
      if (oracle.playsBoard) for (const value of sentence.matchAll(/(?:bets?|raises?) for value|value[- ](?:bet|raise)|バリュー(?:ベット|レイズ)|バリューで/ig)) {
        const explicitHero = /\byou\b|your hand|this hand|自分|手札/.test(sentence.slice(0, value.index));
        if (!negative(sentence, value.index, value.index + value[0].length) && (heroAssertion(sentence, path, value.index, input.combo) || explicitHero && !/opponent|相手/.test(sentence.slice(0, value.index)))) add("made-hand-wrong", "Board-only hand cannot claim own value advantage", sentence, "plays board; split at best");
      }
      // Generic "a flush draw may overtake" is ambiguous: that holding can
      // improve to a higher full house or straight flush. Check only an explicit
      // ordinary-flush outcome, never the documented paired-board outs approximation.
      if (oracle.made.categoryIndex >= 6 && /(?:ordinary flush(?: completion)?[^.]{0,45}(?:beats?|overtakes?)|(?:beaten|overtaken)[^.]{0,25}ordinary flush|通常のフラッシュ[^。]{0,25}(?:勝つ|逆転する))/i.test(sentence) && !/(?:cannot|can't|never|not|ない|ません)/i.test(sentence)) add("made-hand-wrong", "An ordinary flush completion cannot overtake the evaluated full house or better", sentence, oracle.made.category);
      if (/only (?:loses?|behind).*sets?(?: or better| and above)|セット以上に(?:しか)?負け/i.test(sentence) && !/(?:not|ない)/i.test(sentence.replace(/しか負けない/g, "しか負け")) && oracle.beaters.some(b => b.category === "twoPair")) add("made-hand-wrong", "Losses restricted to sets, but legal two-pair holdings also win", sentence, "two pair or better");
      const drawPattern = /\b(?:gutshot|open[- ]ended(?: straight draw)?|double[- ]gutter(?: straight draw)?|(?:flush|straight|combo) draw|backdoor(?: flush| straight)? draw)\b|ガットショット|オープンエンド|ダブルガット|(?:フラッシュ|ストレート|コンボ)ドロー|バックドア(?:フラッシュ|ストレート)?ドロー/ig;
      for (const m of sentence.matchAll(drawPattern)) {
        if (negative(sentence, m.index, m.index + m[0].length) || !heroAssertion(sentence, path, m.index, input.combo)) continue;
        const backdoor = /backdoor|バックドア/.test(sentence.slice(Math.max(0, m.index - 15), m.index + m[0].length));
        if (oracle.board.length === 5) add("draw-wrong", "A river holding has no future-card draws", sentence);
        else if (backdoor) { if (oracle.board.length !== 3) add("draw-wrong", "Backdoor draw needs two future cards", sentence); }
        else if (/flush|フラッシュ/.test(m[0])) { if (!draws.flushOuts) add("draw-wrong", "Asserted flush draw has no hole-using completion", sentence); }
        else if (!draws.ranks.length) add("draw-wrong", "Asserted straight draw has zero meaningful completion ranks", sentence);
      }
      if (/completes? (?:it|the straight)|で完成/.test(sentence) && /gutshot|straight|ガット|ストレート|handCopy/.test(sentence + path)) {
        const matches = [...sentence.matchAll(/\b(?:an? )?(two|deuce|three|four|five|six|seven|eight|nine|ten|jack|queen|king|ace|[2-9TJQKA])(?=\s+(?:or\s+|completes?))/ig), ...sentence.matchAll(/([2-9TJQKA]|10)(?=で完成|か(?:[2-9TJQKA]|10)で完成)/g)];
        for (const m of matches) {
          const r = rankNumber(m[1]);
          if (!draws.ranks.includes(r) && !negative(sentence, m.index, m.index + m[0].length)) add("draw-wrong", "Named straight-completion rank is not a meaningful out", sentence, draws.ranks.map(r => RANKS[r]), RANKS[r]);
        }
      }
    }
  }
  checkNumbers(input, entries, add);
  return findings;
}

function checkNumbers(input, entries, add) {
  const decision = input.decision ?? {}, d = decision.defence ?? input.explanation?.defence ?? input.facts?.defence ?? decision.judgment?.defence ?? decision.judgment ?? decision;
  const required = d.required_equity;
  for (const { text, path } of entries) {
    for (const match of text.matchAll(/(?:need|needed|required equity|pot odds|必要勝率|必要な|ポットオッズ)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s*(?:needed|required)/ig)) {
      if (Number.isFinite(required) && Math.abs(Number(match[1] ?? match[2]) - required * 100) > 1.1) add("number-wrong", "Required equity differs from this node's judgment", text, Math.round(required * 100), Number(match[1] ?? match[2]));
    }
    if (/pot odds|ポットオッズ/i.test(path + text) || /call .*to win|をコールして/.test(text)) {
      const amount = text.match(/(?:call\s+)?(\d+(?:\.\d+)?)\s*bb\s*(?:to win|をコールして)\s*(\d+(?:\.\d+)?)\s*bb/i);
      if (amount) {
        const pot = d.pot_before_bb + d.bet_bb - (d.rake_bb ?? 0);
        if (Number.isFinite(d.call_bb) && Math.abs(Number(amount[1]) - d.call_bb) > 0.11) add("number-wrong", "Call amount differs from actual judgment", text, d.call_bb, Number(amount[1]));
        if (Number.isFinite(pot) && Math.abs(Number(amount[2]) - pot) > 0.11) add("number-wrong", "Pot-to-win amount differs from actual judgment", text, pot, Number(amount[2]));
      }
    }
    const index = path.match(/actionReasons\.(\d+)\.label$/)?.[1], action = index === undefined ? undefined : input.rendered.actionReasons[index].action;
    const sizing = action && decision.actionSizing?.[action] ? decision.actionSizing[action] : decision.sizing ?? input.sizing;
    if (sizing) for (const m of text.matchAll(/(Bet|Raise|ベット|レイズ)\s+(\d+(?:\.\d+)?)\s*(?:bb)?\s*\((\d+(?:\.\d+)?)%\)/ig)) {
      const type = /Bet|ベット/i.test(m[1]) ? "bet" : "raise", s = sizing[type] ?? sizing;
      const amount = s.amount_bb ?? s.amount, fraction = s.pot_fraction ?? s.fraction;
      if (Number.isFinite(amount) && Math.abs(Number(m[2]) - amount) > 0.11 || Number.isFinite(fraction) && Math.abs(Number(m[3]) - fraction * 100) > 1.1) add("number-wrong", "Rendered sizing differs from actual node sizing", text, s, { amount: Number(m[2]), pct: Number(m[3]) });
    }
    if (action && Array.isArray(decision.options)) {
      const option = decision.options.find(o => o.action === action), m = text.match(/(?:Call|コール|All-in|オールイン)\s+(\d+(?:\.\d+)?)/i);
      if (m && Number.isFinite(option?.amountBb) && Math.abs(Number(m[1]) - option.amountBb) > 0.11) add("number-wrong", "Rendered call/all-in amount differs from legal option", text, option.amountBb, Number(m[1]));
    }
  }
  const mix = input.actionMix ?? input.facts?.actionMix;
  if (mix) for (const row of input.rendered?.actionReasons ?? []) {
    if (Number.isFinite(row.frequency) && Number.isFinite(mix[row.action]) && Math.abs(row.frequency - mix[row.action]) > 0.0051) add("number-wrong", "Rendered action frequency differs from recorded mix", row.text ?? row.label, mix[row.action], row.frequency);
  }
}
