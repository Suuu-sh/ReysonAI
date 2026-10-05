import type { RankState, IssuedMatch, RankedMatch, LeaderboardPlayer } from "./types.ts";
import { accountApiBase } from '../account/config.ts';
export function rankedRequest(path: "profile", body?: unknown): Promise<{ state: RankState; enabled: boolean }>;
export function rankedRequest(path: "matches", body?: unknown): Promise<{ state: RankState; match: IssuedMatch }>;
export function rankedRequest(path: `matches/${string}/finish`, body?: unknown): Promise<{ state: RankState; match: RankedMatch }>;
export function rankedRequest(path: `leaderboard?period=${string}`, body?: unknown): Promise<{ rows: LeaderboardPlayer[] }>;
export async function rankedRequest(path: string, body: unknown = undefined) {
  const response=await fetch(`${accountApiBase(import.meta.env??{})}/v1/ranked/${path}`,{credentials:'include',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error??'ranked_service_unavailable');
  return result;
}
