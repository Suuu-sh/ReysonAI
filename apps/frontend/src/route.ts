// App URLs. Every page has its own path so a reload stays where you were.
//
//   /analyze/ranges                          range analysis (the app's front page; the spot lives in the query)
//   /learn/trainer                           trainer home
//   /learn/trainer/drills                    drill library
//   /learn/trainer/drills/new                new drill
//   /learn/trainer/drills/:id/edit           edit a drill
//   /learn/trainer/drills/:id/play[/result]  a drill in progress, then its result
//   /learn/trainer/review/play[/result]      the review drill
//   /learn/trainer/ranked/play[/result]      a ranked match
//   /learn/trainer/ranked/leaderboard        leaderboard
//   /learn/agent/:table[/watch]              Reyson Agent table (watch: spectate)
//   /learn/sessions  /learn/analysis  /learn/weakness
//   /account/:tab
//   /welcome                                 first-run onboarding (reloads land on the front page)
//
// Older addresses (/app, /ranges, /solutions, /trainer/…, /sessions, /analysis, /weakness) are rewritten by canonicalPath.
// Section names match RANGE_SECTION (components/layout.tsx) and ACCOUNT_SECTION (account/AccountMenu.tsx);
// they are spelled out here so the marketing site can import this file without pulling in the app.
const RANGE_SECTION = "レンジ分析";
const ACCOUNT_SECTION = "アカウント";
const TRAINER_SECTION = "トレーナー";

export const HOME_PATH = "/analyze/ranges";
export const PRODUCTION_APP_URL = "https://app.reysonai.com";

export function appEntryHref(hostname: string) {
  return hostname === "reysonai.com" ? PRODUCTION_APP_URL : HOME_PATH;
}
// Shown in the address bar while first-run onboarding is up; the page behind it keeps its own path.
export const WELCOME_PATH = "/welcome";

const SECTIONS: [string, string][] = [
  [RANGE_SECTION, "/analyze/ranges"],
  [TRAINER_SECTION, "/learn/trainer"],
  ["セッション", "/learn/sessions"],
  ["プレー分析", "/learn/analysis"],
  ["弱点", "/learn/weakness"],
];

const clean = (path: string) => (path.replace(/\/+$/, "") || "/");
const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

// Paths the app (not the marketing site) answers, including the old ones it redirects.
export function isAppPath(pathname: string) {
  const path = clean(pathname);
  return ["/app", "/ranges", "/trainer", "/sessions", "/analysis", "/weakness", "/account", "/learn", "/analyze", "/solutions", WELCOME_PATH].some(base => under(path, base));
}

export function isProductAppRoute(pathname: string, hostname: string) {
  return hostname === "app.reysonai.com" || isAppPath(pathname);
}

// The current address for an old one; anything else is returned cleaned.
export function canonicalPath(pathname: string) {
  const path = clean(pathname);
  if (under(path, "/app") || under(path, "/ranges") || under(path, "/solutions") || path === "/analyze" || path === WELCOME_PATH) return HOME_PATH;
  if (under(path, "/trainer")) return trainerPath(legacyTrainerRoute(path));
  for (const name of ["sessions", "analysis", "weakness"]) if (under(path, `/${name}`)) return `/learn/${name}`;
  if (path === "/learn") return "/learn/trainer";
  return path;
}

export function sectionOfPath(pathname: string) {
  const path = canonicalPath(pathname);
  if (under(path, "/account")) return `${ACCOUNT_SECTION}#${path.split("/")[2] ?? "account"}`;
  if (under(path, "/learn/agent")) return TRAINER_SECTION;
  return SECTIONS.find(([, base]) => under(path, base))?.[0] ?? RANGE_SECTION;
}

export function pathOfSection(section: string) {
  const [name, tab] = section.split("#");
  if (name === ACCOUNT_SECTION) return `/account/${tab || "account"}`;
  return SECTIONS.find(([key]) => key === name)?.[1] ?? HOME_PATH;
}

export type TrainerRoute =
  | { phase: "library" } | { phase: "drills" } | { phase: "ranking" }
  | { phase: "new" } | { phase: "edit"; id: string }
  | { phase: "drill" | "result"; key: string } // key: drill id, "review" or "ranked"
  | { phase: "agent"; tableId: string; watch: boolean };

const segments = (path: string) => clean(path).split("/").filter(Boolean).map(value => { try { return decodeURIComponent(value); } catch { return value; } });

export function trainerRouteOf(pathname: string): TrainerRoute {
  const parts = segments(canonicalPath(pathname));
  if (parts[0] !== "learn") return { phase: "library" };
  if (parts[1] === "agent" && parts[2]) return { phase: "agent", tableId: parts[2], watch: parts[3] === "watch" };
  const [area, id, action, tail] = parts.slice(2);
  const played = (key: string, step: string | undefined) => ({ phase: step === "result" ? "result" : "drill", key }) as TrainerRoute;
  if (area === "ranked") return id === "play" ? played("ranked", action) : { phase: "ranking" };
  if (area === "review" && id === "play") return played("review", action);
  if (area === "drills") {
    if (id === "new") return { phase: "new" };
    if (id && action === "edit") return { phase: "edit", id };
    if (id && action === "play") return played(id, tail);
    return { phase: "drills" };
  }
  return { phase: "library" };
}

// The /trainer/… layout before /learn.
function legacyTrainerRoute(path: string): TrainerRoute {
  const parts = segments(path).slice(1);
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
  const play = (key: string) => key === "ranked" ? "/learn/trainer/ranked/play" : key === "review" ? "/learn/trainer/review/play" : `/learn/trainer/drills/${id(key)}/play`;
  switch (route.phase) {
    case "drills": return "/learn/trainer/drills";
    case "ranking": return "/learn/trainer/ranked/leaderboard";
    case "new": return "/learn/trainer/drills/new";
    case "edit": return `/learn/trainer/drills/${id(route.id)}/edit`;
    case "drill": return play(route.key);
    case "result": return `${play(route.key)}/result`;
    case "agent": return `/learn/agent/${id(route.tableId)}${route.watch ? "/watch" : ""}`;
    default: return "/learn/trainer";
  }
}
