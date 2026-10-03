// App URLs. Every page has its own path so a reload stays where you were.
//
//   /ranges                     range analysis (the app's front page)
//   /trainer                    trainer home
//   /trainer/drills             drill library
//   /trainer/drills/new         new drill
//   /trainer/drills/:id/edit    edit a drill
//   /trainer/play/:key          a drill in progress (key: drill id, "review" or "ranked")
//   /trainer/play/:key/result   its result
//   /trainer/ranking            leaderboard
//   /trainer/agent/:table       Reyson Agent table (/watch to spectate)
//   /sessions  /analysis  /weakness
//   /account/:tab
// Section names match RANGE_SECTION (components/layout.tsx) and ACCOUNT_SECTION (account/AccountMenu.tsx);
// they are spelled out here so the marketing site can import this file without pulling in the app.
const RANGE_SECTION = "レンジ分析";
const ACCOUNT_SECTION = "アカウント";

export const HOME_PATH = "/ranges";

const SECTIONS: [string, string][] = [
  [RANGE_SECTION, "/ranges"],
  ["トレーナー", "/trainer"],
  ["セッション", "/sessions"],
  ["プレー分析", "/analysis"],
  ["弱点", "/weakness"],
];

const clean = (path: string) => (path.replace(/\/+$/, "") || "/");

// Paths the app (not the marketing site) answers.
export function isAppPath(pathname: string) {
  const path = clean(pathname);
  return path === "/app" || path.startsWith("/app/") || path === "/account" || path.startsWith("/account/")
    || SECTIONS.some(([, base]) => path === base || path.startsWith(`${base}/`));
}

export function sectionOfPath(pathname: string) {
  const path = clean(pathname);
  if (path === "/account" || path.startsWith("/account/")) return `${ACCOUNT_SECTION}#${path.split("/")[2] ?? "account"}`;
  return SECTIONS.find(([, base]) => path === base || path.startsWith(`${base}/`))?.[0] ?? RANGE_SECTION;
}

export function pathOfSection(section: string) {
  const [name, tab] = section.split("#");
  if (name === ACCOUNT_SECTION) return `/account/${tab || "account"}`;
  return SECTIONS.find(([key]) => key === name)?.[1] ?? HOME_PATH;
}

export type TrainerRoute =
  | { phase: "library" } | { phase: "drills" } | { phase: "ranking" }
  | { phase: "new" } | { phase: "edit"; id: string }
  | { phase: "drill" | "result"; key: string }
  | { phase: "agent"; tableId: string; watch: boolean };

export function trainerRouteOf(pathname: string): TrainerRoute {
  const parts = clean(pathname).split("/").slice(2).map(decodeURIComponent);
  if (parts[0] === "drills" && parts[1] === "new") return { phase: "new" };
  if (parts[0] === "drills" && parts[1] && parts[2] === "edit") return { phase: "edit", id: parts[1] };
  if (parts[0] === "drills") return { phase: "drills" };
  if (parts[0] === "ranking") return { phase: "ranking" };
  if (parts[0] === "play" && parts[1]) return { phase: parts[2] === "result" ? "result" : "drill", key: parts[1] };
  if (parts[0] === "agent" && parts[1]) return { phase: "agent", tableId: parts[1], watch: parts[2] === "watch" };
  return { phase: "library" };
}

export function trainerPath(route: TrainerRoute) {
  const id = (value: string) => encodeURIComponent(value);
  switch (route.phase) {
    case "drills": return "/trainer/drills";
    case "ranking": return "/trainer/ranking";
    case "new": return "/trainer/drills/new";
    case "edit": return `/trainer/drills/${id(route.id)}/edit`;
    case "drill": return `/trainer/play/${id(route.key)}`;
    case "result": return `/trainer/play/${id(route.key)}/result`;
    case "agent": return `/trainer/agent/${id(route.tableId)}${route.watch ? "/watch" : ""}`;
    default: return "/trainer";
  }
}
