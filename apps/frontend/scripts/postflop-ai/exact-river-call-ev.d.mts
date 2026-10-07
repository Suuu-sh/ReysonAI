import type { DefenceContext } from './defence.ts';
export type Dyadic = { n: bigint; e: number };
export type UnknownRiverCall = { status: 'unknown'; reason: string };
export type CompiledRiverCall = { status: 'compiled'; board: Set<number>; score?: Int32Array; netPot: number; call: number;
  rows: { lo: number; hi: number; rank: number | undefined; units: bigint }[]; netUnits: bigint; callUnits: bigint };
export type RiverCallResult = UnknownRiverCall | { status: 'known'; sign: -1 | 0 | 1; compatible_combos: number; win_combos: number; tie_combos: number };
export function positiveDyadic(value: number): Dyadic;
export function compileRiverCallEv(context: DefenceContext, score?: Int32Array): UnknownRiverCall | CompiledRiverCall;
export function exactRiverCallEv(compiled: UnknownRiverCall | CompiledRiverCall | null | undefined, hero: readonly number[]): RiverCallResult;
