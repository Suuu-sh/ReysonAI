export const navigation = [
  { label: "Why Solvea", href: "#why" },
  { label: "How it works", href: "#how" },
  { label: "AI Solution", href: "#solution" },
  { label: "Pricing", href: "#pricing" },
] as const;

export const plans = [
  {
    name: "Free",
    price: "¥0",
    cadence: "forever",
    description: "Start seeing the game more clearly.",
    features: ["Explore available preflop ranges", "Hand-by-hand explanations", "Simple and standard display modes"],
    action: "Try the preview",
    href: "/app",
    status: "Available preview",
  },
  {
    name: "Plus",
    price: "¥680",
    cadence: "/ month · proposed",
    description: "A deeper practice space, when it's ready.",
    features: ["Expanded learning tools", "More guided training", "Future adaptive features"],
    action: "Coming soon",
    href: null,
    status: "Planned · pricing may change",
  },
] as const;

export const responseExamples = [
  {
    prompt: "Everyone at my table calls too much.",
    response: "I'd favor hands that retain value when called and reconsider the weakest opens.",
  },
  {
    prompt: "They almost never 3-bet.",
    response: "We could revisit the opens that normally suffer against frequent 3-bets.",
  },
  {
    prompt: "Make this easier to remember.",
    response: "Let's group similar hands into a smaller number of clear decisions.",
  },
] as const;
