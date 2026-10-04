// Prepared read-only route, intentionally NOT registered in index.ts. The default
// registry is empty. Publishing requires a separately reviewed hash-pinned build
// config; D1 rows or caller-provided query strings cannot grant approval.
import type { D1Database } from './postflop.ts';

export type Mw3ApprovedDelivery = { spotId: string; stage: 'flop' | 'later'; deliveryHash: string };
const HASH = /^[a-f0-9]{64}$/;
const SPOT = /^[A-Za-z0-9_-]{1,100}$/;
const encoder = new TextEncoder();
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' };
async function sha(text: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))), b => b.toString(16).padStart(2, '0')).join('');
}
function failure(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), { status, headers: { ...HEADERS, 'cache-control': 'no-store', ...(status === 405 ? { allow: 'GET' } : {}) } });
}
function success(request: Request, text: string, hash: string): Response {
  const etag = `"${hash}"`;
  const matches = (request.headers.get('if-none-match') ?? '').split(',').some(value => [etag, `W/${etag}`, '*'].includes(value.trim()));
  return new Response(matches ? null : text, { status: matches ? 304 : 200, headers: { ...HEADERS, etag, 'cache-control': 'public, max-age=300, must-revalidate' } });
}

export async function routeMw3Transport(request: Request, db: D1Database | undefined, approved: readonly Mw3ApprovedDelivery[] = []): Promise<Response> {
  if (request.method !== 'GET') return failure(405, 'method_not_allowed');
  const url = new URL(request.url), isPart = url.pathname === '/v1/mw3/part';
  if (!isPart && url.pathname !== '/v1/mw3/manifest') return failure(404, 'not_found');
  const query = [...url.searchParams], allowed = isPart ? ['delivery', 'part'] : ['delivery'];
  const delivery = url.searchParams.get('delivery') ?? '', partText = url.searchParams.get('part') ?? '';
  if (query.length !== allowed.length || new Set(query.map(([key]) => key)).size !== allowed.length ||
      query.some(([key]) => !allowed.includes(key)) || !HASH.test(delivery) || isPart && !/^(0|[1-9][0-9]{0,3})$/.test(partText)) return failure(400, 'invalid_query');
  const trusted = approved.filter(item => item.deliveryHash === delivery && HASH.test(item.deliveryHash) && SPOT.test(item.spotId) && ['flop', 'later'].includes(item.stage));
  if (trusted.length !== 1) return failure(404, 'unpublished_delivery');
  if (!db) return failure(503, 'delivery_unavailable');
  try {
    const { results } = await db.prepare('SELECT spot_id, stage, header_json FROM mw3_policy_deliveries WHERE delivery_hash = ?').bind(delivery)
      .all<{ spot_id: string; stage: string; header_json: string }>();
    const row = results[0];
    if (results.length !== 1 || row.spot_id !== trusted[0].spotId || row.stage !== trusted[0].stage ||
        typeof row.header_json !== 'string' || encoder.encode(row.header_json).length > 200_000 || await sha(row.header_json) !== delivery) return failure(503, 'delivery_unavailable');
    const header = JSON.parse(row.header_json), manifest = header.manifest;
    if (header.version !== 1 || header.kind !== 'ai_estimate_not_gto' || header.stage !== row.stage ||
        manifest?.version !== 1 || manifest.spotId !== row.spot_id || !Number.isInteger(manifest.parts) || manifest.parts < 1 || manifest.parts > 2000 ||
        !Array.isArray(manifest.stages) || JSON.stringify(manifest.stages) !== JSON.stringify(row.stage === 'flop' ? ['flop'] : ['turn', 'river']) ||
        !Number.isInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes > 20_000_000 || !HASH.test(manifest.payloadHash) || !HASH.test(manifest.policyHash) ||
        header.metadata?.spot !== row.spot_id || header.metadata?.policy_hash !== manifest.policyHash ||
        !Array.isArray(header.partHashes) || header.partHashes.length !== manifest.parts || header.partHashes.some((hash: unknown) => typeof hash !== 'string' || !HASH.test(hash))) return failure(503, 'delivery_unavailable');
    if (!isPart) return success(request, row.header_json, delivery);
    const part = Number(partText);
    if (part >= manifest.parts) return failure(404, 'part_not_found');
    const partRows = await db.prepare('SELECT body FROM mw3_policy_parts WHERE delivery_hash = ? AND part = ?').bind(delivery, part).all<{ body: string }>();
    const body = partRows.results[0]?.body;
    if (partRows.results.length !== 1 || typeof body !== 'string' || body.length > 16000 || await sha(body) !== header.partHashes[part]) return failure(503, 'delivery_unavailable');
    const text = JSON.stringify({ part, body });
    return success(request, text, await sha(text));
  } catch {
    return failure(503, 'delivery_unavailable');
  }
}
