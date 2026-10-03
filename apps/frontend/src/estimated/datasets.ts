// Preflop datasets (the JSON files in this directory, e.g. "opening-ranges" or
// "reasons/BB_vs_BTN"). The files stay the source of truth for generation and audits; the app
// reads the published copy from the reysonai-api worker (`VITE_API_BASE`), or from the Vite dev
// server's same-shaped /v1/preflop/datasets route when no base is set.
//
// Modules read datasets synchronously with dataset(name). The browser entry preloads what a
// route needs before importing it; Node (scripts and tests) reads the files on demand.

const registry = new Map<string, unknown>();
const pending = new Map<string, Promise<unknown>>();

// Needed synchronously by the app and the admin dashboard; everything else loads on demand.
export const APP_DATASETS = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses",
  "limp-responses", "limp-deep-responses", "table-profile-adjustments"];
export const ADMIN_DATASETS = [...APP_DATASETS, "five-bet-responses", "cold-three-bet-responses",
  "multiway-responses", "squeeze-responses", "multiway2-responses", "cold-four-bet-responses"];

const apiBase = (): string => String((import.meta as any).env?.VITE_API_BASE ?? "").replace(/\/$/, "");
// Kept in a variable: Vite would bundle every JSON file matched by `new URL(..., import.meta.url)`.
const here = import.meta.url;
const nodeFs = () => (globalThis as any).process?.getBuiltinModule?.("node:fs");

export function dataset<T = any>(name: string): T {
  if (registry.has(name)) return registry.get(name) as T;
  const fs = nodeFs();
  if (!fs) throw new Error(`Preflop dataset ${name} is not loaded`);
  const value = JSON.parse(fs.readFileSync(new URL(`./${name}.json`, here), "utf8"));
  registry.set(name, value);
  return value;
}

export function loadDataset<T = any>(name: string): Promise<T> {
  if (registry.has(name)) return Promise.resolve(registry.get(name) as T);
  if (nodeFs()) return Promise.resolve().then(() => dataset<T>(name));
  if (!pending.has(name)) {
    pending.set(name, fetch(`${apiBase()}/v1/preflop/datasets/${name}`)
      .then(async response => {
        if (!response.ok) throw new Error(`${name} を読み込めませんでした（${response.status}）。`);
        const value = await response.json();
        registry.set(name, value);
        return value;
      })
      .finally(() => pending.delete(name)));
  }
  return pending.get(name) as Promise<T>;
}

export const preloadDatasets = (names: string[]) => Promise.all(names.map(name => loadDataset(name)));

// Names of every published dataset (e.g. to know which spots have detailed reasons).
// hasDataset() answers synchronously once datasetNames() has resolved (the entry preloads it).
let index: Promise<string[]> | null = null;
let known: Set<string> | null = null;
export function hasDataset(name: string): boolean {
  if (!known && nodeFs()) known = new Set(listFiles(nodeFs(), new URL("./", here)));
  return Boolean(known?.has(name));
}

export function datasetNames(): Promise<string[]> {
  if (!index) {
    const fs = nodeFs();
    index = fs
      ? Promise.resolve(listFiles(fs, new URL("./", here)))
      : fetch(`${apiBase()}/v1/preflop/datasets`).then(async response => {
        if (!response.ok) throw new Error(`データセット一覧を読み込めませんでした（${response.status}）。`);
        return Object.keys((await response.json()).datasets);
      });
    index.then(names => { known = new Set(names); }, () => { index = null; });
  }
  return index;
}

function listFiles(fs: any, dir: URL, prefix = ""): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry: any) => entry.isDirectory()
    ? listFiles(fs, new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`)
    : entry.name.endsWith(".json") ? [`${prefix}${entry.name.slice(0, -5)}`] : []);
}
