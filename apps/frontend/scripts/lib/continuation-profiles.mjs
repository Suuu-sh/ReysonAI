// Explicit independent hand-group profiles. Not copied from a solver or a HU
// response. Calls remain candidates until the common EQR/EV gate accepts them.
import { hands } from "../../src/data.ts";

function profile(text, base = null) {
  const out = new Map(base ?? hands.map(hand => [hand, [0, 0]]));
  const seen = new Set();
  for (const line of text.trim().split("\n")) {
    const [numbers, names] = line.split(":");
    const values = numbers.trim().split(/\s+/).map(Number);
    if (values.length !== 2 || values.some(n => !Number.isInteger(n) || n < 0 || n > 100) || values[0] + values[1] > 100) throw new Error(`Bad profile ${line}`);
    for (const hand of names.trim().split(/\s+/)) {
      if (!out.has(hand) || seen.has(hand)) throw new Error(`Bad profile hand ${hand}`);
      seen.add(hand); out.set(hand, values);
    }
  }
  return out;
}

// Facing a 3bet with at least two known participants: protect a real flatting
// range with AA/KK/AKs. QQ/AK raise for value less often than AA/KK; wheel aces
// are the small blocker exception. Later opens justify a wider candidate set,
// never an automatic positive-EV claim. The saved conditional source removes
// any hand that the actor did not hold on this path.
const THREE = profile(`
25 75: AA
35 65: KK
55 35: QQ
60 40: AKs
50 40: AKo
55 15: JJ
45 5: TT
35 0: 99
25 0: 88 77
15 0: 66 55
10 0: 44 33 22
50 15: AQs
35 5: AJs KQs
25 0: ATs AQo KJs QJs JTs
10 0: AJo KTs QTs T9s 98s 87s
0 10: A5s
0 5: A4s
`);
const THREE_LATE = profile(`
50 45: QQ
55 25: JJ
55 10: TT
50 5: 99
40 0: 88 77 66
25 0: 55 44 33 22
50 25: AQs
45 10: AJs
40 5: KQs AQo
35 0: ATs AJo KJs QJs JTs KTs QTs
20 0: T9s 98s 87s 76s A9s A8s
0 10: A4s
`, THREE);

// Facing a 4bet: no broad positive-EV fill. The original squeezer has a
// meaningful sunk investment; an earlier caller still owns only its exact
// saved flatting range. Both cases use these independent candidate groups,
// with modest protected-call differences below. Shoves remain fixed 100BB.
const FOUR = profile(`
30 70: AA
40 60: KK
55 35: AKs
40 50: AKo
60 25: QQ
40 5: JJ
25 0: TT
10 0: 99
25 5: AQs
10 0: AJs KQs AQo
0 5: A5s A4s
`);
const FOUR_LATE = profile(`
55 40: QQ
50 15: JJ
40 5: TT
25 0: 99
15 0: 88
40 10: AQs
25 5: AJs
20 0: AQo KQs
10 0: ATs KJs QJs JTs
`, FOUR);
const FOUR_CROWDED = profile(`
30 70: AA
40 55: KK
45 35: AKs
30 35: AKo
45 20: QQ
25 5: JJ
15 0: TT
5 0: 99
20 5: AQs
5 0: AJs KQs
0 0: AQo A4s
`, FOUR);

// The preceding call gate can leave a live opponent with exact AA-only
// support. Do not blindly carry a generic KK/QQ/JJ or wheel-bluff raise into
// that inferred range. Keep AA flat/shove candidates and price-sensitive
// calls. With TWO such opponents, all Ax holdings are already impossible.
// These independent support-aware profiles do not alter any predecessor.
const THREE_PINNED_ACES = profile(`
25 75: AA
35 0: KK
55 0: QQ JJ
60 0: AKs
50 0: AKo AQs
45 0: TT
35 0: 99 AJs KQs
25 0: 88 77 ATs AQo KJs QJs JTs
15 0: 66 55
10 0: 44 33 22 AJo KTs QTs T9s 98s 87s
`);
const FOUR_PINNED_ACES = profile(`
30 70: AA
40 0: KK
45 0: AKs
30 0: AKo
45 0: QQ
25 0: JJ
15 0: TT
5 0: 99
20 0: AQs
5 0: AJs KQs
`);

export function continuationProfile(node, hand, context = null) {
  const late = ["CO", "BTN"].includes(node.opener);
  const pinnedAces = context?.input.ranges.some(range => range.length === 1 && range[0][0] === "AA");
  const selected = pinnedAces ? (node.bet_level === 3 ? THREE_PINNED_ACES : FOUR_PINNED_ACES) : node.bet_level === 3 ? (late ? THREE_LATE : THREE)
    : node.live_participants.length >= 3 ? FOUR_CROWDED : late ? FOUR_LATE : FOUR;
  let [call, aggressive] = selected.get(hand);
  // The squeeze owner already paid the large 3bet. Retain more candidate
  // flats for medium pairs; the exact remaining ranges/price still decide EV.
  if (node.bet_level === 4 && node.hero === node.squeezer && ["JJ", "TT", "99"].includes(hand)) call = Math.min(100 - aggressive, call + 10);
  return { call, aggressive };
}
