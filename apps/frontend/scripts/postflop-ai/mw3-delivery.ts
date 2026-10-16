import type { Street } from './types.ts';
import type { Mw3Policy } from './mw3-types.ts';
export type Mw3PartsManifest = { version: 1; spotId: string; stages: Street[]; parts: number; bytes: number; payloadHash: string; policyHash: string };
export type Mw3Part = { part: number; body: string };
// Lossless, integrity-checked chunks for future D1 transport. This module is pure:
// it does not open a database, publish data, or declare a candidate approved.
import { decodeMw3Policy, encodeMw3Policy } from './mw3-policy-codec.ts';
const encoder = new TextEncoder();
export function mw3TextSha(text: string): Promise<string>;
export async function mw3TextSha(text?: any) : Promise<any> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((byte: any) : any => byte.toString(16).padStart(2, '0')).join('');
}
export function prepareMw3PolicyParts(policy: Mw3Policy): Promise<{ manifest: Mw3PartsManifest; parts: Mw3Part[] }>;
export async function prepareMw3PolicyParts(policy?: any) : Promise<any> {
  const text = JSON.stringify(encodeMw3Policy(policy)), parts: any[] = [];
  // At most 48KB UTF-8, or 32KB quote-escaped ASCII, per body. Splitting UTF-16
  // code units must not cut a surrogate pair (exact UTF-8 hashes survive transit).
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(text.length, offset + 16000);
    if (end < text.length && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end--;
    parts.push({ part: parts.length, body: text.slice(offset, end) }); offset = end;
  }
  return { manifest: { version: 1, spotId: policy.spot_id, stages: policy.streets, parts: parts.length,
    bytes: encoder.encode(text).length, payloadHash: await mw3TextSha(text), policyHash: await mw3TextSha(JSON.stringify(policy)) }, parts };
}
export function restoreMw3PolicyParts(manifest: unknown, parts: unknown): Promise<Mw3Policy>;
export async function restoreMw3PolicyParts(manifest?: any, parts?: any) : Promise<any> {
  if (manifest?.version !== 1 || !Array.isArray(manifest.stages) ||
      !([['flop'], ['turn', 'river']].some((stages: any) : any => stages.length === manifest.stages.length && stages.every((street?: any, index?: any) : any => street === manifest.stages[index]))) || !Number.isInteger(manifest.parts) || manifest.parts <= 0 || manifest.parts > 2000 ||
      !Number.isInteger(manifest.bytes) || manifest.bytes <= 0 || manifest.bytes > 20_000_000 ||
      !/^[a-f0-9]{64}$/.test(manifest.payloadHash) || !/^[a-f0-9]{64}$/.test(manifest.policyHash) ||
      !Array.isArray(parts) || parts.length !== manifest.parts ||
      parts.some((item: any) : any => !Number.isInteger(item.part) || item.part < 0 || item.part >= manifest.parts || typeof item.body !== 'string' || item.body.length > 16000) ||
      parts.reduce((sum?: any, item?: any) : any => sum + item.body.length, 0) > manifest.bytes ||
      new Set(parts.map((item: any) : any => item.part)).size !== manifest.parts) throw new Error('Missing or malformed mw3 policy parts');
  const text = [...parts].sort((a?: any, b?: any) : any => a.part - b.part).map((item: any) : any => item.body).join('');
  if (encoder.encode(text).length !== manifest.bytes || await mw3TextSha(text) !== manifest.payloadHash) throw new Error('mw3 policy payload integrity mismatch');
  const policy = decodeMw3Policy(JSON.parse(text));
  if (policy.spot_id !== manifest.spotId || policy.streets.length !== manifest.stages.length || policy.streets.some((street?: any, index?: any) : any => street !== manifest.stages[index]) ||
      await mw3TextSha(JSON.stringify(policy)) !== manifest.policyHash) throw new Error('mw3 decoded policy identity mismatch');
  return policy;
}
