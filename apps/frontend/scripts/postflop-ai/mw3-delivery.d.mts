import type { Street } from './types.ts';
import type { Mw3Policy } from './mw3-types.ts';
export type Mw3PartsManifest = { version: 1; spotId: string; stages: Street[]; parts: number; bytes: number; payloadHash: string; policyHash: string };
export type Mw3Part = { part: number; body: string };
export function mw3TextSha(text: string): Promise<string>;
export function prepareMw3PolicyParts(policy: Mw3Policy): Promise<{ manifest: Mw3PartsManifest; parts: Mw3Part[] }>;
export function restoreMw3PolicyParts(manifest: unknown, parts: unknown): Promise<Mw3Policy>;
