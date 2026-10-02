import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { hands } from '../src/data.ts';
import { fourBetToSize, openSizeFor, threeBetToSize } from '../src/estimated/sizing.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cacheDir = join(root, '.local', 'estimated');
const positions = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const pending = new Map();

export function validateRequest(value) {
  if (value?.scenario === 'five_bet_all_in_response') {
    const { opener, hero, callers, three_bet_size_bb, four_bet_size_bb, all_in_size_bb } = value;
    const oi = positions.indexOf(opener), hi = positions.indexOf(hero);
    if (oi < 0 || oi >= 5 || hi <= oi || !Array.isArray(callers) || callers.length !== 0 ||
        !Number.isFinite(three_bet_size_bb) || three_bet_size_bb !== threeBetToSize(opener, hero) ||
        !Number.isFinite(four_bet_size_bb) || four_bet_size_bb !== fourBetToSize(opener, hero) || all_in_size_bb !== 100) {
      throw new Error('対応する局面は、オープン→3bet→4bet→100BB 5betオールイン後の応答のみです。');
    }
    return { scenario: 'five_bet_all_in_response', opener, hero, callers: [], three_bet_size_bb, four_bet_size_bb, all_in_size_bb };
  }
  if (value?.scenario !== undefined && value.scenario !== 'multiway_response') throw new Error('対応していない局面です。');
  const { opener, hero, callers } = value ?? {};
  const oi = positions.indexOf(opener), hi = positions.indexOf(hero);
  if (oi < 0 || oi >= 5 || hi <= oi || !Array.isArray(callers) || callers.length < 1 ||
      new Set(callers).size !== callers.length || callers.some(p => positions.indexOf(p) <= oi || positions.indexOf(p) >= hi)) {
    throw new Error('対応する局面は、オープン→1人以上のコール→後続Heroの判断のみです。');
  }
  return { opener, hero, callers: [...callers].sort((a, b) => positions.indexOf(a) - positions.indexOf(b)) };
}

export function validateEstimate(data, request) {
  if (request.scenario === 'five_bet_all_in_response') {
    if (data?.kind !== 'ai_estimate_not_gto' || data?.scenario !== request.scenario ||
        data?.effective_stack_bb !== 100 || data?.open_size_bb !== openSizeFor(request.opener) ||
        data?.opener !== request.opener || data?.hero !== request.hero ||
        JSON.stringify(data.callers) !== '[]' || data?.three_bet_size_bb !== request.three_bet_size_bb ||
        data?.four_bet_size_bb !== request.four_bet_size_bb || data?.all_in_size_bb !== 100 ||
        !Array.isArray(data.ranges) || data.ranges.length !== 1) throw new Error('生成データの局面・前提が一致しません。');
    const range = data.ranges[0];
    if (range.position !== request.opener || range.raise_to_bb !== null ||
        JSON.stringify(range.available_actions) !== JSON.stringify(['call', 'fold']) ||
        !Array.isArray(range.rows) || range.rows.length !== 169) throw new Error('オープナーの応答レンジまたは合法アクションが不正です。');
    for (let i = 0; i < 169; i++) {
      const row = range.rows[i];
      if (!Array.isArray(row) || row.length !== 4 || row[0] !== hands[i] ||
          !row.slice(1).every(n => Number.isInteger(n) && n >= 0 && n <= 100) ||
          row[1] + row[2] !== 100 || row[3] !== 0) throw new Error(range.position + '/' + hands[i] + 'の頻度が不正です。');
    }
    return data;
  }
  if (data?.kind !== 'ai_estimate_not_gto' || data?.effective_stack_bb !== 100 ||
      data?.open_size_bb !== openSizeFor(request.opener) || data?.opener !== request.opener || data?.hero !== request.hero ||
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
  return Math.min(100, openSizeFor(request.opener) * ((ip ? 4.5 : 5) + request.callers.length - 1));
}

function promptFor(request) {
  if (request.scenario === 'five_bet_all_in_response') {
    const openSize = openSizeFor(request.opener);
    return [
      'Author one LOCAL EXPERIMENTAL AI-ESTIMATED 6-max preflop response range, not solver/GTO/equilibrium output. No tools, code, or file edits; return JSON only. Cash 100BB effective, no ante, unspecified rake, raise-to sizes are total BB.',
      'History: all seats before ' + request.opener + ' fold → ' + request.opener + ' raises to ' + openSize + 'BB → all seats between opener and ' + request.hero + ' fold → ' + request.hero + ' 3bets to ' + request.three_bet_size_bb + 'BB → ' + request.opener + ' 4bets to ' + request.four_bet_size_bb + 'BB → ' + request.hero + ' 5bets all-in to 100BB. The original opener now responds; every other player has folded.',
      'Produce a conditional range for ' + request.opener + ' only, with legal actions call and fold (no raise option). For each of all 169 canonical hands output integer [fold,call,0] frequencies summing to 100; the final zero is a reserved raise column and must remain zero. Estimate hand strength under the prior 3bet and 4bet sizes and all-in pressure, with plausible calls and folds across the range.',
      'Use exactly one raise_to_bb:null and available_actions:["call","fold"]. Rows must be in EXACT canonical order: ' + hands.join(',') + '. Output JSON with kind="ai_estimate_not_gto", scenario="' + request.scenario + '", effective_stack_bb=100, open_size_bb=' + openSize + ', opener="' + request.opener + '", hero="' + request.hero + '", callers=[], three_bet_size_bb=' + request.three_bet_size_bb + ', four_bet_size_bb=' + request.four_bet_size_bb + ', all_in_size_bb=100, ranges=[{position="' + request.opener + '",raise_to_bb:null,available_actions:["call","fold"],rows:[[hand,fold,call,0],...]}]. No EV or solver claim; do not include other participants.'
    ].join(' ');
  }
  const openSize = openSizeFor(request.opener);
  const callerText = request.callers.map(p => `${p} call ${openSize}BB`).join(' → ');
  const ranges = [...request.callers, request.hero];
  const raiseTo = p => squeezeSize(request, p);
  return `You are authoring LOCAL EXPERIMENTAL AI-ESTIMATED 6-max preflop frequencies, not solver/GTO/equilibrium output. No tools, no code, no file edits; return JSON only. Cash 100BB effective, no ante, unspecified rake, raise-to sizes in total BB. History: all seats before ${request.opener} fold → ${request.opener} raises to ${openSize}BB → ${callerText} → ${request.hero} faces ${openSize}BB. Seats between named actions fold. Produce independent estimated decision ranges for ${ranges.join(', ')}: each caller's earlier fold/call/squeeze decision conditional on preceding history, then Hero's current fold/call/squeeze decision. For each position use one raise_to_bb: ${ranges.map(p => `${p}=${raiseTo(p)}`).join(', ')}. actions row order [hand,fold,call,raise], integer percentages sum exactly 100. 169 rows each in EXACT canonical order: ${hands.join(',')}. Distinct position/history-sensitive estimates, not a copied table. Do not assign any positive call/raise to obviously impossible or nonsensical hands without reason. Output kind="ai_estimate_not_gto", effective_stack_bb=100, open_size_bb=${openSize}, opener="${request.opener}", hero="${request.hero}", callers=${JSON.stringify(request.callers)}, ranges=[{position,raise_to_bb,rows}]. No EV/solver claim.`;
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
            kind: { type: 'string' }, scenario: { type: 'string' }, effective_stack_bb: { type: 'number' }, open_size_bb: { type: 'number' },
            opener: { type: 'string' }, hero: { type: 'string' }, callers: { type: 'array', items: { type: 'string' } },
            three_bet_size_bb: { type: 'number' }, four_bet_size_bb: { type: 'number' }, all_in_size_bb: { type: 'number' },
            ranges: { type: 'array', items: { type: 'object', properties: {
              position: { type: 'string' }, raise_to_bb: { anyOf: [{ type: 'number' }, { type: 'null' }] },
              available_actions: { type: 'array', items: { type: 'string' } },
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
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'solveaai_local_estimates', title: 'SolveaAI local estimates', version: '0.1.0' }, capabilities: {} } });
  });
}

export async function getEstimate(value, generate = false, generator = runCodex) {
  const request = validateRequest(value);
  const key = createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const path = join(cacheDir, `${key}.json`);
  try { return { data: validateEstimate(JSON.parse(await readFile(path, 'utf8')), request), cached: true }; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!generate) return { data: null, cached: false, pending: pending.has(key) };
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
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/local-estimates') { next(); return; }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) { res.writeHead(405).end('{}'); return; }
  const origin = req.headers.origin;
  if (!['127.0.0.1', 'localhost'].includes(req.headers.host?.split(':')[0]) ||
      origin && !['http://127.0.0.1:5173', 'http://localhost:5173'].includes(origin)) { res.writeHead(403).end('{}'); return; }
  try {
    let value;
    if (req.method === 'GET') {
      const raw = url.searchParams.get('request');
      if (!raw || raw.length > 2048) throw new Error('リクエストが不正です。');
      value = JSON.parse(raw);
    } else {
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 2048) throw new Error('リクエストが大きすぎます。'); }
      value = JSON.parse(body);
    }
    const result = await getEstimate(value, req.method === 'POST');
    res.writeHead(200).end(JSON.stringify(result));
  } catch (error) { res.writeHead(400).end(JSON.stringify({ error: error.message })); }
}
