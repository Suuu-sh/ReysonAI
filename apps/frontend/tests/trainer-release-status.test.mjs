import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("..", import.meta.url));
async function homeModule(dev, locale) {
  const bundle = await build({
    stdin: { contents: 'export { TrainerHome } from "./src/trainer/DrillLibrary.tsx"; export { emptyRankState, RANKED_ENABLED } from "./src/trainer/rank-store.ts";', resolveDir: root, loader: "tsx" },
    bundle: true, write: false, platform: "node", format: "esm", jsx: "automatic",
    external: ["react", "@phosphor-icons/react"], loader: { ".css": "empty" },
    define: { "import.meta.env.DEV": String(dev), "import.meta.url": JSON.stringify(new URL("../src/estimated/datasets.ts", import.meta.url).href) },
    plugins: [{ name: "release-test-locale", setup(builder) {
      builder.onResolve({ filter: /locale\.ts$/ }, () => ({ path: "locale", namespace: "release-test" }));
      builder.onLoad({ filter: /.*/, namespace: "release-test" }, () => ({
        contents: `export const productLocale = () => ${JSON.stringify(locale)}; export const localized = (en, ja) => ${JSON.stringify(locale)} === "en" ? en : ja;`,
      }));
    } }],
  });
  const code = bundle.outputFiles[0].text.replace(/from "((?:react(?:\/jsx-runtime)?)|@phosphor-icons\/react)"/g, (_, name) => `from "${import.meta.resolve(name)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
function props(rank) {
  return {
    drills: [], reviewCount: 0, rank,
    drafts: { ranked: { key: "ranked", savedAt: 1, session: { answered: 2 } } },
    onOpenDrills() {}, onCreate() {}, onStartReview() {}, onResume() {},
    onStartRanked() {}, onOpenRanking() {}, onStartAgent() {},
  };
}
// Expand only landing/card layout, leaving avatar and icon hook components opaque.
function buttons(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (typeof node.type === "function" && ["RankedComingSoon", "RankedCard", "AgentEntry", "DrillsBlock", "ModeBlock"].includes(node.type.name)) return buttons(node.type(node.props));
  return [...(node.type === "button" ? [node] : []), ...buttons(node.props?.children)];
}
for (const locale of ["en", "ja"]) {
  test(`production trainer displays closed Ranked and title-adjacent Agent beta (${locale})`, async () => {
    const { TrainerHome, emptyRankState, RANKED_ENABLED } = await homeModule(false, locale);
    assert.equal(RANKED_ENABLED, false);
    const input = props(emptyRankState());
    let rankedCalls = 0, rankingCalls = 0, resumeCalls = 0;
    const agentCalls = [];
    input.onStartRanked = () => rankedCalls++;
    input.onOpenRanking = () => rankingCalls++;
    input.onResume = () => resumeCalls++;
    input.onStartAgent = (...args) => agentCalls.push(args);
    const tree = TrainerHome(input);
    const html = renderToStaticMarkup(tree);
    const ranked = html.match(/<section class="mode-block is-ranked is-coming-soon"[\s\S]*?<\/section>/)?.[0];
    assert.ok(ranked);
    assert.match(ranked, /<svg class="rank-badge" data-tier="master" width="64" height="64"/);
    assert.ok(ranked.includes(locale === "en" ? 'aria-label="Master rank"' : 'aria-label="マスターランク"'));
    assert.ok(ranked.includes(locale === "en" ? "Coming soon" : "近日公開"));
    assert.match(ranked, /<button[^>]*disabled=""/);
    assert.doesNotMatch(ranked, /mode-secondary|ranked-stats|rank-ladder/);
    assert.match(html, locale === "en" ? /<h3>Agent table<span class="mode-release-status">Beta<\/span><\/h3>/ : /<h3>Agent戦<span class="mode-release-status">β版<\/span><\/h3>/);
    const controls = buttons(tree);
    for (const control of controls) if (!control.props.disabled) control.props.onClick?.();
    assert.equal(rankedCalls, 0);
    assert.equal(rankingCalls, 0);
    assert.equal(resumeCalls, 0, "saved ranked draft must not expose a resume path");
    assert.equal(agentCalls.length, 2);
    assert.equal(agentCalls[0][1], false);
    assert.equal(agentCalls[1][1], true);
    assert.equal(controls.filter(control => !control.props.disabled).length, 4, "Agent sit/watch and drills open/create remain active");
  });
}
test("local development keeps genuine ranked and leaderboard controls", async () => {
  const { TrainerHome, emptyRankState, RANKED_ENABLED } = await homeModule(true, "en");
  assert.equal(RANKED_ENABLED, true);
  const input = props(emptyRankState());
  let started = 0, ranking = 0, resumed = 0;
  input.onStartRanked = () => started++;
  input.onOpenRanking = () => ranking++;
  input.onResume = () => resumed++;
  const tree = TrainerHome(input);
  const html = renderToStaticMarkup(tree);
  assert.doesNotMatch(html, /Coming soon|is-coming-soon/);
  assert.match(html, /Leaderboard/);
  for (const control of buttons(tree)) if (!control.props.disabled) control.props.onClick?.();
  assert.equal(started, 1);
  assert.equal(ranking, 1);
  assert.equal(resumed, 1);
});
test("direct ranked routes retain production guards independently of the visible teaser", async () => {
  const page = await readFile(new URL("../src/trainer/TrainerPage.tsx", import.meta.url), "utf8");
  assert.match(page, /const rankedClosed = route\.key === "ranked" && \(!RANKED_ENABLED \|\|/);
  assert.match(page, /if \(drill && !rankedClosed\) begin\(drill, route\.key === "review"\); else setPhase\(route\.key === "ranked" \|\| !drill \? "library" : "drills", true\)/);
  assert.match(page, /phase === "ranking" && RANKED_ENABLED \? <Leaderboard/);
  // Execute the actual direct-route initialization branch with and without a saved
  // ranked draft. No browser hooks, saved data, or route implementations are replaced.
  const routeBranch = page.match(/    if \(route.phase === "drill"[\s\S]*?(?=    if \(route.phase === "agent")/)?.[0];
  assert.ok(routeBranch);
  const initialize = new Function("route", "active", "keyOf", "RANKED_DRILL", "reviewDrill", "drills", "RANKED_ENABLED", "drafts", "playedToday", "rankState", "RANKED_DAILY_LIMIT", "begin", "setPhase", routeBranch);
  for (const drafts of [{}, { ranked: { session: { answered: 2 } } }]) {
    const begun = [], redirects = [];
    initialize({ phase: "drill", key: "ranked" }, null, () => "ranked", { id: "ranked" }, {}, [], false, drafts, () => 0, {}, 3,
      (...args) => begun.push(args), (...args) => redirects.push(args));
    assert.deepEqual(begun, []);
    assert.deepEqual(redirects, [["library", true]]);
  }
});
