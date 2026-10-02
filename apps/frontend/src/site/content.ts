export type SiteLocale = "en" | "ja";

export const en = {
  title: "EvionAI — Poker strategy you can actually use",
  description: "Read AI-estimated preflop ranges on a clear 13×13 chart, see why each hand plays the way it does, and drill it. An estimate for learning, not a GTO solver.",
  common: { home: "EvionAI home", open: "Open the app", menuOpen: "Open menu", menuClose: "Close menu", menuLabel: "Main navigation", skip: "Skip to content", language: "日本語", languageLabel: "日本語に切り替える", raise: "Raise", threeBet: "3bet", call: "Call", fold: "Fold", available: "Available", planned: "Planned", experimental: "Experimental" },
  nav: [
    { label: "How it works", href: "#how" },
    { label: "Try a drill", href: "#drill" },
    { label: "Our approach", href: "#approach" },
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
  ],
  hero: { title1: "Complex strategy,", title2: "made playable.", lead: "EvionAI turns AI-estimated poker ranges into a chart you can read at a glance, and explains every hand in plain words, so it's still there when you sit down at the table.", primary: "Open the app", secondary: "See how it works", note: "Free preview · No account needed · 6-max cash, 100BB" },
  preview: { spotLabel: "Preview spot", open: "BTN open", response: "BB vs BTN", displayLabel: "Display mode", simpleMode: "Simple", standardMode: "Standard", matrixLabel: "13 by 13 starting-hand chart", scrollLabel: "chart, scrolls sideways on small screens", selectedHand: "Selected hand", suited: "Suited", offsuit: "Offsuit", pair: "Pair", frequencyLabel: "Action frequencies", why: "Why", k7s: "K7s is suited and playable after the flop. In this BTN opening estimate, it is raised every time.", simpleOther: (spot: string, hand: string, action: string) => `In this saved ${spot} range, ${hand}'s main action is ${action}. Open the app for the full hand-level explanation.`, other: (spot: string, hand: string, action: string, value: number) => `In this saved ${spot} range, ${hand} is ${action} ${value}% of the time. Open the app for the full hand-level explanation.`, explore: "Explore it in the app", saved: "Saved AI estimate", notGto: "Not a GTO solution", spotOpening: "BTN opening", spotResponse: "BB response", actionPast: { raise: "raised", threeBet: "3bet", call: "called", fold: "folded" }, touring: "Touring hands. Click any cell to take over.", manual: "Click any hand to see it." },
  facts: { items: ["hands on every chart", "of all hands open from the button", "of hands the big blind continues with against that open", "big blinds deep, 6-max cash"], source: "Counted from the saved estimates shown above, weighted by combinations." },
  how: {
    title1: "From spot to reason,", title2: "in three moves.",
    steps: [
      { title: "Set the spot.", body: "Walk the action seat by seat. Folded to the button, a 2.5BB open, the big blind to act. EvionAI finds the saved range for exactly that history, and says so when there isn't one." },
      { title: "Read the colors.", body: "Each of the 169 hands shows its main action as one solid color. Start there. Switch to Standard when you want to see where decisions mix." },
      { title: "Know why.", body: "Tap a hand to see its exact action mix and the facts behind it, in plain language instead of a wall of numbers." },
    ],
    toAct: "To act", openSize: "Raise 2.5BB", pot: "Pot 4BB", combos: "of hands",
    whyHand: "A5s · BB vs BTN", whyNote: "In the app, every hand detail adds the recorded reasons behind its mix.",
  },
  drill: { title1: "Ten seconds.", title2: "One decision.", description: "It folds to you on the button. Do you open? Answer, then see what the saved estimate does with the same hand.", question: "BTN to act", tableFold: "Fold", stakes: "Cash · 6-max · 100BB", pot: "Pot", raise: "Raise 2.5BB", fold: "Fold", next: "Next", match: "Same as the estimate", differ: "The estimate differs", mixed: "Mixed hand", frequency: (value: number) => `The estimate takes this ${value}% of the time`, score: (matched: number, played: number) => `${matched} of ${played} matched`, tableLabel: (hand: string) => `Table. Folded to the button, you hold ${hand}.`, note: "Practice compares your answer with the saved AI estimate, not with a GTO solution or real results." },
  approach: {
    title1: "An estimate,", title2: "labeled as one.",
    description: "EvionAI's ranges are AI estimates built for learning. Every chart says so, and a spot without saved data stays empty instead of being filled with a guess.",
    isTitle: "What EvionAI is", is: ["AI-estimated preflop ranges for 6-max cash, 100BB, no ante", "Checked for structural consistency and explained in plain language", "A practice tool that shows where you differ from the estimate"],
    isntTitle: "What it isn't", isnt: ["A GTO solver, or solver output", "A promise of win rate or profit", "A source of invented answers for spots it hasn't recorded"],
    processTitle: "How a range gets here",
    process: [{ title: "Estimate", detail: "AI-estimated strategy" }, { title: "Check", detail: "Structural checks" }, { title: "Explain", detail: "Reasons you can learn from" }, { title: "Review together", detail: "Planned" }],
  },
  roadmap: {
    title1: "What works today.", title2: "What comes next.",
    nowTitle: "Available now", nextTitle: "Planned",
    now: [
      { title: "Range analysis", detail: "Saved preflop ranges for opens, responses, 3bets, 4bets, limps and some multiway paths.", tag: "" },
      { title: "Preflop trainer", detail: "Drills built on saved open and vs-open ranges, with scoring, explanations and review.", tag: "" },
      { title: "Session review", detail: "Your practice history, tendencies and weak spots, stored in this browser.", tag: "" },
      { title: "Postflop trial", detail: "Flop-to-river frequencies on supported heads-up paths, for any valid board.", tag: "Experimental" },
    ],
    next: [
      { title: "Table-aware coaching", detail: "Describe the players at your table and see adjustments explained.", tag: "" },
      { title: "Deeper training", detail: "More guided learning paths and advanced drills.", tag: "" },
      { title: "Accounts and sync", detail: "Keep your practice across devices.", tag: "" },
      { title: "Plus plan", detail: "Paid features, with pricing still provisional.", tag: "" },
    ],
  },
  pricing: { title1: "Start free.", title2: "Grow when it's ready.", description: "The current preview is free. A paid plan is an early proposal, not a live subscription.", note: "The ¥680 Plus price and all paid features are provisional. No billing or account system is available yet.", plans: [{ name: "Free", price: "¥0", cadence: "forever", description: "Everything in the current preview.", features: ["Saved preflop ranges and hand details", "Simple and Standard display", "Preflop trainer and session review"], action: "Open the app", href: "/app" as string | null, status: "Available" }, { name: "Plus", price: "¥680", cadence: "/ month · proposed", description: "A deeper practice space, when it's ready.", features: ["Expanded learning tools", "More guided training", "Future table-aware features"], action: "Coming later", href: null as string | null, status: "Planned · price may change" }] },
  faq: {
    title: "Questions, answered plainly.",
    items: [
      { question: "Is this GTO?", answer: "No. EvionAI shows AI-estimated ranges for learning. They are not solver output and are not guaranteed to be mathematically optimal." },
      { question: "Which games does it cover?", answer: "6-max cash games at 100BB with no ante. Opens are 2.5BB, or 3.5BB from the small blind. Spots without saved data are shown as unrecorded, never guessed." },
      { question: "Do I need an account?", answer: "No. Your profile and practice history are saved in this browser. Accounts are planned." },
      { question: "Does it cover postflop?", answer: "An experimental trial covers supported heads-up paths from flop to river. The app labels it as experimental." },
      { question: "What does it cost?", answer: "The current preview is free. A Plus plan has been proposed, but it isn't available and its price may change." },
    ],
  },
  final: { title1: "Your next session", title2: "starts with one hand.", description: "Open the app, pick a spot, tap a hand.", action: "Open EvionAI", note: "Free preview · No account required" },
  footer: { tagline: "Poker strategy, made playable.", product: "Product", open: "Open the app", how: "How it works", drill: "Try a drill", pricing: "Pricing", faq: "FAQ", legal: "Legal", privacy: "Privacy · coming soon", terms: "Terms · coming soon", disclaimer: "EvionAI provides poker strategy and educational information. AI Solutions are estimates and are not guaranteed to be mathematically optimal or equivalent to GTO solutions. Please play responsibly." },
};

export type SiteCopy = typeof en;
