// Author-only proposal/evidence generation. Does not create a review or strategy approval.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import parser from '../postflop-ai/vendor/babel-parser-7.29.7.ts';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const frontend = 'apps/frontend/';
const priorPath = 'configs/typescript-policy-source.review.json';
const proposalPath = 'configs/typescript-policy-source-migration-proposal.json';
const evidencePath = 'apps/frontend/docs/mw3-source-identity/typescript-policy-source-parity.json';
const adapterPath = `${frontend}scripts/lib/typescript-policy-source.ts`;
const generatorPath = `${frontend}scripts/lib/prepare-typescript-policy-source.ts`;
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const git = (args: string[]) => execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const baseline = git(['rev-parse', process.argv[2] ?? 'df2370690e9b3172f2c109f80113b320880f940a']).toString().trim();
const oldBytes = (path: string) => git(['show', `${baseline}:${path}`]);
const read = (path: string) => readFileSync(resolve(root, path));
const rec = (path: string, bytes: Buffer) => ({ path, bytes: bytes.length, sha256: sha(bytes) });
const priorBytes = read(priorPath), prior = JSON.parse(priorBytes.toString());
if (!priorBytes.equals(oldBytes(priorPath))) throw new Error('Prior review receipt must remain byte-identical');
const names = new Set<string>(Object.keys(prior.sources));
for (const [path, name] of [['scripts/lib/continuation-reasons.mjs', 'POLICY_FILES'], ['scripts/lib/stage3-reasons.mjs', 'STAGE3_REASON_POLICY_FILES']]) {
  const ast = parser.parse(oldBytes(frontend + path).toString(), { sourceType: 'module' });
  const declaration = ast.program.body.flatMap((node: any) => (node.declaration ?? node).declarations ?? []).find((node: any) => node.id.name === name);
  for (const value of declaration.init.elements) names.add(value.value);
}
const sources = [...names].sort().map(historical_name => {
  const inherited = Object.hasOwn(prior.sources, historical_name), previous = prior.sources[historical_name];
  const baseline_path = previous?.path ?? historical_name, previousBytes = oldBytes(frontend + baseline_path);
  if (inherited && sha(previousBytes) !== previous.current_sha256) throw new Error(`Prior current pin is not HEAD baseline: ${historical_name}`);
  const current_path = baseline_path.replace(/\.(?:mjs|js)$/, '.ts'), current = read(frontend + current_path);
  const legacy_source = inherited ? previous.legacy_source : previousBytes.toString();
  const legacy_sha256 = inherited ? previous.legacy_sha256 : sha(previousBytes);
  if (sha(legacy_source) !== legacy_sha256) throw new Error(`Legacy raw bytes differ: ${historical_name}`);
  return { historical_name, current_path, current_sha256: sha(current), current_bytes: current.length,
    baseline_path, baseline_sha256: sha(previousBytes), baseline_bytes: previousBytes.length, inherited,
    legacy_sha256, legacy_bytes: Buffer.byteLength(legacy_source), legacy_source };
});
const proposal = { schema_version: 1, kind: 'typescript-policy-source-migration-proposal', status: 'unapproved-proposal',
  baseline_commit: baseline, prior_receipt_sha256: sha(priorBytes), sources };
writeFileSync(resolve(root, proposalPath), `${JSON.stringify(proposal, null, 2)}\n`);
const omit = new Set(['loc', 'start', 'end', 'extra', 'comments', 'tokens', 'leadingComments', 'innerComments', 'trailingComments']);
const relocations: { module: string; before: string; after: string }[] = [];
function normalize(node: any, module: string, previous: boolean): any {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(value => normalize(value, module, previous));
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (omit.has(key)) continue;
    if (previous && ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && key === 'source' && value) {
      const source = value as any, next = source.value.replace(/\.(?:mjs|js)$/, '.ts');
      if (next !== source.value) {
        const oldPath = relative(root, resolve(root, dirname(module), source.value));
        // Do not normalize arbitrary strings/dynamic imports/logic/constants.
        oldBytes(oldPath); read(oldPath.replace(/\.(?:mjs|js)$/, '.ts'));
        relocations.push({ module, before: source.value, after: next });
      }
      result[key] = { ...normalize(source, module, previous), value: next };
    } else result[key] = normalize(value, module, previous);
  }
  return result;
}
const astHash = (body: Buffer, path: string, previous: boolean) => sha(JSON.stringify(normalize(parser.parse(stripTypeScriptTypes(body.toString(), { mode: 'strip' }), { sourceType: 'module' }), path, previous)));
const pairs = sources.map(source => {
  const prior = oldBytes(frontend + source.baseline_path), current = read(frontend + source.current_path);
  const before = astHash(prior, frontend + source.baseline_path, true), after = astHash(current, frontend + source.current_path, false);
  if (before !== after) throw new Error(`Erased executable AST differs: ${source.historical_name}`);
  return { historical_name: source.historical_name, inherited: source.inherited, previous: rec(frontend + source.baseline_path, prior), current: rec(frontend + source.current_path, current),
    previous_executable_ast_sha256: before, current_executable_ast_sha256: after, status: 'exact-executable-ast-parity' };
});
const evidence = { schema_version: 1, kind: 'typescript-policy-source-parity-evidence', status: 'source-evidence-for-independent-approval-not-approval',
  scope: 'Preserve exact previously reviewed/raw-hashed source identities through annotations and module relocation only. No strategy, data, payout, numerical model, publication or runtime approval renewed.',
  baseline_commit: baseline, prior_receipt: rec(priorPath, priorBytes), proposal: rec(proposalPath, read(proposalPath)), adapter: rec(adapterPath, read(adapterPath)),
  generator: rec(generatorPath, read(generatorPath)), generation_command: `node apps/frontend/scripts/lib/prepare-typescript-policy-source.ts ${baseline}`,
  normalization: { type_erasure: 'node:module stripTypeScriptTypes(mode=strip)', parser: '@babel/parser 7.29.7 vendored', omitted_ast_fields: [...omit],
    scope: 'Only static import/export specifiers with exact old Git source/current TS paths. No arbitrary strings, dynamic imports, constants, policy frequencies, seeds or versions normalized.',
    static_module_relocations: relocations },
  pairs, summary: { sources: pairs.length, inherited: sources.filter(source => source.inherited).length, newly_explicit_prior_raw: sources.filter(source => !source.inherited).length,
    exact_executable_ast_parity: pairs.length, approval: 'NOT_CREATED; independent gpt-6-astra approval required' } };
writeFileSync(resolve(root, evidencePath), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence.summary));
