// Dummy leaderboard players for local development only (Vite dev server). Production and tests
// never see them: until accounts sync ranked results, the real board holds only this browser's
// player. Deterministic so the local board looks the same on every reload.
import { seededRandom, seedFor } from "../../scripts/lib/equity.mjs";

const NAMES = ["Kaito", "mika_gto", "RiverRat", "ShoveBot", "Haru", "nit_kun", "Yuzu", "BluffLord", "Sora77", "AceHigh",
  "takumi", "3betKing", "Lyn", "PotOdds", "Ren", "check_raise", "Mei", "FoldPls", "Daichi", "SnapCall", "Aoi", "MinRaise"];

export type DemoPlayer = { name: string; rating: number; gain: number; matches: number; accuracy: number; demo: true };

export function demoPlayers(period: "week" | "all"): DemoPlayer[] {
  const random = seededRandom(seedFor(`leaderboard-demo|${period}`));
  return NAMES.map(name => {
    const skill = random();
    const rating = Math.round(900 + skill * 760 + (random() - 0.5) * 60);
    const matches = period === "week" ? 1 + Math.floor(random() * 14) : 6 + Math.floor(random() * 80);
    const gain = Math.round((random() - 0.4) * (period === "week" ? 120 : 420));
    const accuracy = Math.min(0.95, Math.max(0.45, 0.55 + skill * 0.33 + (random() - 0.5) * 0.06));
    return { name, rating, gain, matches, accuracy, demo: true as const };
  });
}

export const showDemoPlayers = () => Boolean((import.meta as any).env?.DEV);
