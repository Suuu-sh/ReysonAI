export type SiteLocale = "en" | "ja";

export const en = {
  title: "ReysonAI — Don't just play. Understand why.",
  description: "Read AI-estimated preflop ranges on a clear 13×13 chart, see why each hand plays the way it does, and drill it. An estimate for learning, not a GTO solver.",
  common: { home: "ReysonAI home", open: "Open the app", menuOpen: "Open menu", menuClose: "Close menu", menuLabel: "Main navigation", skip: "Skip to content", language: "日本語", languageLabel: "日本語に切り替える", raise: "Raise", threeBet: "3bet", call: "Call", fold: "Fold", available: "Available", planned: "Planned", experimental: "Experimental" },
  nav: [
    { label: "How it works", href: "#how" },
    { label: "Training", href: "#drill" },
    { label: "Analysis", href: "#analysis" },
    { label: "Compare", href: "#compare" },
    { label: "Pricing", href: "#pricing" },
  ],
  hero: { title1: "Don't just play.", title2: "Understand why.", lead: "ReysonAI shows what to do with every hand, and explains why in plain words. When you know the reason, the decision is still there when you sit down at the table.", primary: "Open the app", secondary: "See how it works", note: "Free preview · No account needed · 6-max cash, 100BB" },
  preview: { spotLabel: "Preview spot", open: "BTN open", response: "BB vs BTN", displayLabel: "Display mode", simpleMode: "Simple", standardMode: "Standard", matrixLabel: "13 by 13 starting-hand chart", scrollLabel: "chart, scrolls sideways on small screens", selectedHand: "Selected hand", suited: "Suited", offsuit: "Offsuit", pair: "Pair", frequencyLabel: "Action frequencies", why: "Why", k7s: "K7s is suited and playable after the flop. In this BTN opening estimate, it is raised every time.", simpleOther: (spot: string, hand: string, action: string) => `In this saved ${spot} range, ${hand}'s main action is ${action}. Open the app for the full hand-level explanation.`, other: (spot: string, hand: string, action: string, value: number) => `In this saved ${spot} range, ${hand} is ${action} ${value}% of the time. Open the app for the full hand-level explanation.`, explore: "Explore it in the app", saved: "Saved AI estimate", notGto: "Not a GTO solution", spotOpening: "BTN opening", spotResponse: "BB response", actionPast: { raise: "raised", threeBet: "3bet", call: "called", fold: "folded" }, touring: "Touring hands. Click any cell to take over.", manual: "Click any hand to see it." },
  how: {
    title1: "From spot to reason,", title2: "in three moves.",
    steps: [
      { title: "Set the spot.", body: "Walk the action seat by seat. Folded to the button, a 2.5BB open, the big blind to act." },
      { title: "Read the colors.", body: "Each of the 169 hands shows its main action as one solid color. Start there. Switch to Standard when you want to see where decisions mix." },
      { title: "Know why.", body: "Tap a hand to see its exact action mix and the facts behind it, in plain language instead of a wall of numbers." },
    ],
    toAct: "To act", openSize: "Raise 2.5BB", pot: "Pot 4BB", combos: "of hands",
    whyHand: "A5s · BB vs BTN", whyNote: "A suited ace with an ace blocker and wheel (A–5 straight) potential. It has 52.3% equity against the button's opening range and 43.3%, close to even, against the hands that continue. Counting the 54.9% of the time the button folds to a 12BB 3-bet, 3-betting beats calling. Some combos still call, keeping strong hands in the calling range too.",
  },
  drill: { title1: "Ten seconds.", title2: "One decision.", description: "It folds to you on the button. Do you open? Answer, then see what the saved estimate does with the same hand.", question: "BTN to act", tableFold: "Fold", stakes: "Cash · 6-max · 100BB", pot: "Pot", raise: "Raise 2.5BB", fold: "Fold", next: "Next", match: "Same as the estimate", differ: "The estimate differs", mixed: "Mixed hand", frequency: (value: number) => `The estimate takes this ${value}% of the time`, score: (matched: number, played: number) => `${matched} of ${played} matched`, tableLabel: (hand: string) => `Table. Folded to the button, you hold ${hand}.`, note: "Practice compares your answer with the saved AI estimate, not with a GTO solution or real results." },
  audience: {
    title1: "For players who'd rather", title2: "play than solve.",
    items: [
      { level: "Beginner", quote: "Which hands should I even play?", body: "Simple display shows each hand's main action first, starting from the spots that come up most.", gets: "Simple display · common spots first" },
      { level: "Beginner to intermediate", quote: "I memorized the chart. I still don't get the mixes.", body: "Standard display shows the exact frequencies, and every hand explains why it mixes.", gets: "Standard display · hand-by-hand reasons" },
      { level: "On a budget", quote: "Solvers cost too much for me.", body: "The preview is free. Practice with range charts, hand-by-hand reasons, twenty-question drills, ranked matches, and an analysis page, without paying for a solver subscription.", gets: "Drills · ranked matches · analysis" },
    ],
    views: ["Simple display", "Hand detail", "Free preview"],
    freeList: ["Range charts for saved spots", "Hand-by-hand reasons", "Drills and session review", "Play analysis"],
    freeNote: "No account needed",
    note: "Studying exact solver output for custom game trees? A solver-based app is the better tool for that.",
  },
  ranked: {
    status: "Coming soon", title1: "Ranked matches.", title2: "A rating you earn.",
    description: "Twenty questions under the same conditions for everyone. Clear-cut hands barely move your rating; mixed hands move it most. Climb from Bronze to Master.",
    points: ["20 questions across every spot, standard difficulty", "Three ranked matches a day", "Elo-style rating: harder hands count for more", "Weekly and all-time leaderboard"],
    sample: "Sample", rank: "Rank", rating: "Rating", peak: "Peak", toNext: (points: number, tier: string) => `${points} to ${tier}`, today: "2 / 3 matches left today", lastMatch: "Last match", matchLine: (correct: number, total: number) => `${correct} / ${total} correct · ${Math.round(correct / total * 100)}% accuracy`,
    tiers: ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master"],
  },
  agent: {
    status: "Beta", title1: "Agent table.", title2: "Put it to work in real hands.",
    description: "Sit at a 6-max table with five Agents that play the Reyson AI estimate. Use the ranges you studied on the hands you are dealt. Fold any time, then watch the rest or skip ahead.",
    points: ["Every Agent plays the Reyson solver (AI estimate)", "100BB cash game, results kept in points", "Your play style read from your latest 1,000 hands", "Heads-up after the flop for now (beta)"],
    sample: "Sample", you: "You", toAct: "Your turn", pot: "Pot", raise: "Raise 2.5", fold: "Fold",
    actions: ["Fold", "Call 2.5", "3bet 8"], read: "Agent read", readStyle: "Tight-aggressive", hands: "312 hands",
  },
  analysis: {
    title1: "See how you", title2: "actually play.",
    description: "Every practice answer is compared with the saved estimate. ReysonAI turns them into a play-style map, action tendencies, strengths, weak spots and what to practice next.",
    points: [
      { title: "Play-style map", body: "Where your choices sit between tight and loose, and how often you 3bet." },
      { title: "Action tendencies", body: "How often you fold, open, call and 3bet compared with the estimate." },
      { title: "Strengths and weak spots", body: "The spots you handle well, and a review queue for the hands you miss." },
      { title: "Session history", body: "Every drill kept in this browser, ready to review or resume." },
    ],
    note: "Built from practice answers saved in this browser. Tendencies describe your practice, not real-game results.",
    sample: "Sample", score: "ReysonAI Score", accuracy: "Accuracy", style: "Play style", styleValue: "TAG", recent: "last 10 answers", answers: "answers",
    map: "Play-style map", tight: "Tight", loose: "Loose", quadrants: ["TAG", "LAG", "Tight-passive", "Loose-passive"],
    tendencies: "Action choices vs estimate", actions: ["Fold", "Open", "Call", "3bet"],
    weak: "Weak spot", weakValue: "CO vs BTN · 3bet", next: "Practice next", nextValue: "A5s · KTo · 76s",
  },
  compare: {
    title1: "Not another", title2: "solver app.",
    description: "Solver-based GTO apps such as GTO Wizard are the reference for exact theory. ReysonAI is built to help you learn a strategy and keep practicing it.",
    us: "ReysonAI", them: "Solver-based GTO apps", themNote: "e.g. GTO Wizard",
    rows: [
      { label: "What you see", us: "AI-estimated ranges, labeled as estimates", them: "Solver-computed GTO strategies" },
      { label: "How it explains", us: "Plain-language reasons for every hand", them: "Numbers first: frequencies and EV" },
      { label: "Level of detail", us: "Simple, Standard or Advanced, set by your level", them: "Full detail, built for experienced players" },
      { label: "Practice", us: "Drills and ranked matches with a rating", them: "Trainers built on solver output" },
      { label: "Feedback", us: "Play-style map, tendencies and weak spots", them: "Scores against solver play" },
      { label: "Precision", us: "A practical approximation, not GTO", them: "Exact within the solved game" },
      { label: "Best for", us: "Beginners to intermediates building habits", them: "Players studying exact theory" },
    ],
    note: "A general comparison of approaches; individual products vary and change. GTO Wizard is a trademark of its owner, and ReysonAI is not affiliated with it.",
  },
  pricing: { title1: "Start free.", title2: "Grow when it's ready.", description: "The current preview is free. A paid plan is an early proposal, not a live subscription.", note: "The ¥680 Plus price and all paid features are provisional. No billing or account system is available yet.", plans: [{ name: "Free", price: "¥0", cadence: "forever", description: "Everything in the current preview.", features: ["Saved preflop ranges and hand details", "Simple and Standard display", "Trainer, session review and play analysis"], action: "Open the app", href: "/ranges" as string | null, status: "Available" }, { name: "Plus", price: "¥680", cadence: "/ month · proposed", description: "A deeper practice space, when it's ready.", features: ["Expanded learning tools", "More guided training", "Future table-aware features"], action: "Coming later", href: null as string | null, status: "Planned · price may change" }] },
  faq: {
    title: "Questions, answered plainly.",
    items: [
      { question: "Is this GTO?", answer: "No. ReysonAI shows AI-estimated ranges for learning. They are not solver output and are not guaranteed to be mathematically optimal." },
      { question: "How is it different from GTO Wizard?", answer: "GTO Wizard and similar apps show solver-computed strategies and are the reference for exact theory. ReysonAI shows AI estimates designed for learning, with explanations, drills, ranked matches and analysis of your practice. See the comparison above." },
      { question: "Which games does it cover?", answer: "6-max cash games at 100BB with no ante. Opens are 2.5BB, or 3.5BB from the small blind. Spots without saved data are shown as unrecorded, never guessed." },
      { question: "Do I need an account?", answer: "No. Your profile and practice history are saved in this browser. Accounts are planned." },
      { question: "Does it cover postflop?", answer: "An experimental trial covers supported heads-up paths from flop to river. The app labels it as experimental." },
      { question: "What does it cost?", answer: "The current preview is free. A Plus plan has been proposed, but it isn't available and its price may change." },
    ],
  },
  final: { title1: "Your next session", title2: "starts with one hand.", description: "Open the app, pick a spot, tap a hand.", action: "Open ReysonAI", note: "Free preview · No account required" },
  footer: { tagline: "Don't just play. Understand why.", product: "Product", open: "Open the app", how: "How it works", drill: "Training", analysis: "Analysis", compare: "Compare", pricing: "Pricing", faq: "FAQ", legal: "Legal", privacy: "Privacy · coming soon", terms: "Terms · coming soon", disclaimer: "ReysonAI provides poker strategy and educational information. AI Solutions are estimates and are not guaranteed to be mathematically optimal or equivalent to GTO solutions. Please play responsibly." },
};

export type SiteCopy = typeof en;
