import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { hands } from '../src/data.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cacheDir = join(root, '.local', 'estimated');
const positions = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const pending = new Map();

export function validateRequest(value) {
  const { opener, hero, callers } = value ?? {};
  const oi = positions.indexOf(opener), hi = positions.indexOf(hero);
  if (oi < 0 || oi >= 5 || hi <= oi || !Array.isArray(callers) || callers.length < 1 ||
      new Set(callers).size !== callers.length || callers.some(p => positions.indexOf(p) <= oi || positions.indexOf(p) >= hi)) {
    throw new Error('対応する局面は、オープン→1人以上のコール→後続Heroの判断のみです。');
  }
  return { opener, hero, callers: [...callers].sort((a, b) => positions.indexOf(a) - positions.indexOf(b)) };
}

export function validateEstimate(data, request) {
  if (data?.kind !== 'ai_estimate_not_gto' || data?.effective_stack_bb !== 100 ||
      data?.open_size_bb !== 2.5 || data?.opener !== request.opener || data?.hero !== request.hero ||
      JSON.stringify(data.callers) !== JSON.stringify(request.callers) || !Array.isArray(data.ranges)) {
    throw new Error('生成データの局面・前提が一致しません。');
  }
  const expected = [...request.callers, request.hero];
  if (data.ranges.length !== expected.length || expected.some((p, i) => data.ranges[i]?.position !== p)) throw new Error('参加者のレンジが不足しています。');
  for (const range of data.ranges) {
    if (!Array.isArray(range.rows) || range.rows.length !== 169 || range.raise_to_bb !== squeezeSize(request, range.position)) throw new Error(`${range.position}の表またはサイズが不正です。`);
    for (let i = 0; i < 169; i++) {
      const row = range.rows[i];
      if (!Array.isArray(row) || row.length !== 4 || row[0] !== hands[i] || !row.slice(1).every(n => Number.isInteger(n) && n >= 0 && n <= 100) || row[1] + row[2] + row[3] !== 100) throw new Error(`${range.position}/${hands[i]}の頻度が不正です。`);
    }
  }
  return data;
}

function squeezeSize(request, position) {
  const ip = !['SB', 'BB'].includes(position) || (position === 'BB' && request.opener === 'SB');
  return Math.min(100, 2.5 * ((ip ? 4.5 : 5) + request.callers.length - 1));
}

function promptFor(request) {
  const callerText = request.callers.map(p => `${p} call 2.5BB`).join(' → ');
  const ranges = [...request.callers, request.hero];
  const raiseTo = p => squeezeSize(request, p);
  return `You are authoring LOCAL EXPERIMENTAL AI-ESTIMATED 6-max preflop frequencies, not solver/GTO/equilibrium output. No tools, no code, no file edits; return JSON only. Cash 100BB effective, no ante, unspecified rake, raise-to sizes in total BB. History: all seats before ${request.opener} fold → ${request.opener} raises to 2.5BB → ${callerText} → ${request.hero} faces 2.5BB. Seats between named actions fold. Produce independent estimated decision ranges for ${ranges.join(', ')}: each caller's earlier fold/call/squeeze decision conditional on preceding history, then Hero's current fold/call/squeeze decision. For each position use one raise_to_bb: ${ranges.map(p => `${p}=${raiseTo(p)}`).join(', ')}. actions row order [hand,fold,call,raise], integer percentages sum exactly 100. 169 rows each in EXACT canonical order: ${hands.join(',')}. Distinct position/history-sensitive estimates, not a copied table. Do not assign any positive call/raise to obviously impossible or nonsensical hands without reason. Output kind="ai_estimate_not_gto", effective_stack_bb=100, open_size_bb=2.5, opener="${request.opener}", hero="${request.hero}", callers=${JSON.stringify(request.callers)}, ranges=[{position,raise_to_bb,rows}]. No EV/solver claim.`;
}

function runCodex(request) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }; delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
    const bundledCodex = '/Applications/ChatGPT.app/Contents/Resources/codex';
    const child = spawn(existsSync(bundledCodex) ? bundledCodex : 'codex', ['app-server', '-c', 'mcp_servers={}'], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', final = '', threadId, done = false;
    const timer = setTimeout(() => fail(new Error('Codexが時間内に完了しませんでした。')), 300000);
    function send(obj) { child.stdin.write(JSON.stringify(obj) + '\n'); }
    function fail(error) { if (done) return; done = true; clearTimeout(timer); child.kill(); reject(error); }
    function finish() { if (done) return; done = true; clearTimeout(timer); child.kill(); try { resolve(JSON.parse(final)); } catch { reject(new Error('CodexのJSON出力を解析できません。')); } }
    child.on('error', fail);
    child.on('exit', code => { if (!done) fail(new Error(`Codex app-server が終了しました (${code})。`)); });
    child.stdout.on('data', chunk => { buffer += chunk; let index; while ((index = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.error) return fail(new Error(msg.error.message ?? 'Codexの応答エラー'));
      if (msg.id === 1) { send({ method: 'initialized', params: {} }); send({ id: 2, method: 'thread/start', params: { cwd: root, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true, model: 'gpt-6-sol' } }); }
      if (msg.id === 2) {
        threadId = msg.result?.thread?.id;
        if (!threadId) return fail(new Error('Codex threadを開始できません。'));
        send({ id: 3, method: 'turn/start', params: {
          threadId,
          input: [{ type: 'text', text: promptFor(request) }],
          outputSchema: { type: 'object', properties: {
            kind: { type: 'string' }, effective_stack_bb: { type: 'number' }, open_size_bb: { type: 'number' },
            opener: { type: 'string' }, hero: { type: 'string' }, callers: { type: 'array', items: { type: 'string' } },
            ranges: { type: 'array', items: { type: 'object', properties: {
              position: { type: 'string' }, raise_to_bb: { type: 'number' },
              rows: { type: 'array', items: { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'integer' }] } } },
            }, required: ['position', 'raise_to_bb', 'rows'], additionalProperties: false } },
          }, required: ['kind', 'effective_stack_bb', 'open_size_bb', 'opener', 'hero', 'callers', 'ranges'], additionalProperties: false },
        } });
      }
      if (msg.method === 'item/completed' && msg.params?.item?.type === 'agentMessage') final = msg.params.item.text ?? final;
      if (msg.method === 'item/agentMessage/delta') final += msg.params?.delta ?? '';
      if (msg.method === 'turn/completed') { if (msg.params?.turn?.status !== 'completed') return fail(new Error(msg.params?.turn?.error?.message ?? 'Codexの生成に失敗しました。')); finish(); }
    } });
    child.stderr.on('data', () => {});
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'solveagto_local_estimates', title: 'SolveaGTO local estimates', version: '0.1.0' }, capabilities: {} } });
  });
}

export async function getEstimate(value, generate = false, generator = runCodex) {
  const request = validateRequest(value);
  const key = createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const path = join(cacheDir, `${key}.json`);
  try { return { data: validateEstimate(JSON.parse(await readFile(path, 'utf8')), request), cached: true }; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!generate) return { data: null, cached: false };
  if (!pending.has(key)) pending.set(key, (async () => {
    const data = validateEstimate(await generator(request), request);
    data.metadata = {
      source: 'ChatGPT-authenticated Codex app-server; local experiment',
      method: 'Independent AI estimates conditioned on seat, prior actions, and fixed raise-to size; not jointly solved.',
      limitations: 'No solver convergence, EV, GTO guarantee, rake adjustment, or downstream branch validation.',
      generated_at: new Date().toISOString(),
    };
    await mkdir(cacheDir, { recursive: true });
    await writeFile(path, JSON.stringify(data) + '\n', { flag: 'wx' });
    return { data, cached: false };
  })().finally(() => pending.delete(key)));
  return pending.get(key);
}

export async function localEstimateMiddleware(req, res, next) {
  if (req.url !== '/local-estimates') { next(); return; }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') { res.writeHead(405).end('{}'); return; }
  const origin = req.headers.origin;
  if (!['127.0.0.1', 'localhost'].includes(req.headers.host?.split(':')[0]) ||
      origin && !['http://127.0.0.1:5173', 'http://localhost:5173'].includes(origin)) { res.writeHead(403).end('{}'); return; }
  try {
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 2048) throw new Error('リクエストが大きすぎます。'); }
    const value = JSON.parse(body);
    const result = await getEstimate(value, true);
    res.writeHead(200).end(JSON.stringify(result));
  } catch (error) { res.writeHead(400).end(JSON.stringify({ error: error.message })); }
}
