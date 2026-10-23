// Synthetic, isolated contract tests for the historical MW3 source adapter.
// Every generated manifest/receipt/source here is test-only; no strategy
// approval or production artifact is created.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const ROOT = new URL('../../../', import.meta.url);
const ADAPTER = 'apps/frontend/scripts/postflop-ai/mw3-manifest-source-identity.ts';
const INVENTORY = 'configs/source-identity-mw3-typescript-archive.json';
const REVIEW = 'configs/source-identity-mw3-typescript-archive.review.json';
const EVIDENCE = 'apps/frontend/docs/mw3-source-identity/typescript-archive-sources-parity.json';
const EXTRAS = [ADAPTER, INVENTORY, REVIEW, EVIDENCE,
  'apps/frontend/docs/mw3-source-identity/typescript-executable-parity.json',
  'apps/frontend/src/estimated/aiv2-contract.ts',
  'apps/frontend/scripts/postflop-ai/flop-isomorphism.d.mts',
  'apps/frontend/scripts/postflop-ai/later-policy.d.mts',
  'apps/frontend/scripts/postflop-ai/mw3-typescript-source-identity-pairs.json',
  'apps/frontend/scripts/postflop-ai/policy.d.mts', 'configs/source-identity-typescript.review.json'].sort();
const EXTENSION = 'apps/frontend/scripts/postflop-ai/mw3-verification-preservation-extension.ts';
const EXT_PROPOSAL = 'configs/source-identity-mw3-verification-preservation.json';
const EXT_REVIEW = 'configs/source-identity-mw3-verification-preservation.review.json';
const EXT_BASELINE = 'apps/frontend/docs/mw3-source-identity/verification-preservation-adapter-baseline.json';
const EXT_EXTRAS = [EXT_BASELINE, EXTENSION, EXT_PROPOSAL, EXT_REVIEW];
const OP_EXTENSION='apps/frontend/scripts/postflop-ai/mw3-operator-preservation-extension.ts';
const OP_PROPOSAL='configs/source-identity-mw3-operator-preservation.json';
const OP_REVIEW='configs/source-identity-mw3-operator-preservation.review.json';
const OP_BASELINE='apps/frontend/docs/mw3-source-identity/operator-preservation-adapter-baseline.json';
const OP_EXTRAS=[OP_EXTENSION,OP_PROPOSAL,OP_REVIEW,OP_BASELINE];
const CURRENT_EXTRAS = [...EXTRAS, ...EXT_EXTRAS, ...OP_EXTRAS].sort();
const PRESERVATION_PATHS = ['apps/frontend/scripts/ci/mw3-local-d1-oracle.ts', 'apps/frontend/scripts/verify-preflop-local-d1.ts'];
const RECIPE_PATHS = ['apps/frontend/scripts/data/mw3-authored/context-judgments.mjs', 'apps/frontend/scripts/data/mw3-authored/emit.mjs',
  'apps/frontend/scripts/data/mw3-authored/registry.mjs', 'apps/frontend/scripts/data/mw3-co-btn-bb-authored.mjs'];
const SPOTS = ['CO_open_BTN_call_BB_call', 'CO_open_BTN_call_SB_call', 'HJ_open_BTN_call_BB_call', 'HJ_open_BTN_call_SB_call',
  'HJ_open_CO_call_BB_call', 'HJ_open_CO_call_BTN_call', 'HJ_open_CO_call_SB_call', 'UTG_open_BTN_call_BB_call', 'UTG_open_BTN_call_SB_call',
  'UTG_open_CO_call_BB_call', 'UTG_open_CO_call_BTN_call', 'UTG_open_CO_call_SB_call', 'UTG_open_HJ_call_BB_call',
  'UTG_open_HJ_call_BTN_call', 'UTG_open_HJ_call_CO_call', 'UTG_open_HJ_call_SB_call'];
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown) => Buffer.from(JSON.stringify(value) + '\n');
const put = (root: string, path: string, value: string | Buffer) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };

function fixture(t: any) {
  const root = mkdtempSync(join(tmpdir(), 'mw3-SYNTHETIC-archive-source-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const helper = readFileSync(new URL(`../../../${ADAPTER}`, import.meta.url)); put(root, ADAPTER, helper);
  const recipeSources = new Map(RECIPE_PATHS.map(path => [path, `legacy recipe source ${path}\n`]));
  const rows: any[] = RECIPE_PATHS.map((path, i) => {
    const historicalBytes = Buffer.from(recipeSources.get(path)!), currentPath = path.replace(/\.mjs$/, '.ts'), currentBytes = Buffer.from(`current TS recipe ${i}\n`);
    put(root, currentPath, currentBytes);
    return { historical: { path, bytes: historicalBytes.length, sha256: sha(historicalBytes) },
      current: { path: currentPath, bytes: currentBytes.length, sha256: sha(currentBytes) }, classification: 'typescript-source-parity' };
  });
  for (let i = 0; i < 146; i++) {
    const path = `fixture/source-${String(i).padStart(3, '0')}.mjs`, body = Buffer.from(`source ${i}\n`), currentPath = `fixture/source-${String(i).padStart(3, '0')}.mjs`;
    put(root, currentPath, body);
    rows.push({ historical: { path, bytes: body.length, sha256: sha(body) }, current: { path: currentPath, bytes: body.length, sha256: sha(body) }, classification: 'exact-byte-identity' });
  }
  for (const path of PRESERVATION_PATHS) {
    const historicalPath=path.replace(/\.ts$/, '.mjs'), prior=Buffer.from('synthetic prior preservation helper '+path), current=Buffer.from('synthetic extended preservation helper '+path);
    put(root,path,current); rows.push({historical:{path:historicalPath,bytes:prior.length,sha256:sha(prior)},current:{path,bytes:prior.length,sha256:sha(prior)},classification:'typescript-source-parity'});
  }
  rows.sort((a, b) => a.historical.path.localeCompare(b.historical.path));
  for (const path of EXTRAS.filter(path => ![ADAPTER, INVENTORY, REVIEW, EVIDENCE].includes(path))) put(root, path, `extra ${path}\n`);
  const extra_current_sources = EXTRAS.filter(path => ![ADAPTER, INVENTORY, REVIEW, EVIDENCE].includes(path))
    .map(path => { const body = readFileSync(join(root, path)); return { path, bytes: body.length, sha256: sha(body) }; });
  const artifactRows = (spot: string) => Array.from({ length: 7 }, (_, i) => {
    const sha256 = sha(`${spot} artifact ${i}`), kind = `artifact-${i}`;
    return { path: `fixture/${spot}-${i}.json`, kind, spot, bytes: 1, sha256, entry: `objects/${sha256}` };
  });
  const accepted_manifests = SPOTS.map((spot, i) => {
    const slug = `synthetic-${i}`, archive = { path: `artifacts/postflop/mw3-${slug}.tar.gz`, format: 'ustar+gzip-content-addressed-v1', bytes: 1, sha256: sha(`archive ${i}`) };
    const artifacts = artifactRows(spot), manifest = { spot: { id: spot, slug }, archive, artifacts }, manifestBytes = json(manifest);
    const receiptPath = `configs/mw3-${slug}.review.json`, receipt = Buffer.from(`receipt ${i}`); put(root, `artifacts/postflop/mw3-${slug}.manifest.json`, manifestBytes); put(root, archive.path, Buffer.from('a'));
    put(root, receiptPath, receipt);
    return { spot, manifest: { path: `artifacts/postflop/mw3-${slug}.manifest.json`, bytes: manifestBytes.length, sha256: sha(manifestBytes) },
      receipt: { path: receiptPath, bytes: receipt.length, sha256: sha(receipt) }, archive, artifacts };
  });
  const archived_recipe_sources = RECIPE_PATHS.map(path => {
    const source = recipeSources.get(path)!; return { path, source, bytes: Buffer.byteLength(source), sha256: sha(source) };
  });
  const inventory: any = { schema_version: 1, kind: 'mw3-typescript-archive-source-inventory', status: 'source-only-proposal', rows,
    archived_recipe_sources, accepted_manifests, extra_current_sources };
  const evidence = { kind: 'mw3-typescript-archive-source-parity', status: 'independently-reviewed', rows: rows.map(({ historical, current, classification }) => ({ historical, current, classification })) };
  put(root, EVIDENCE, json(evidence));
  put(root, INVENTORY, json(inventory));
  const review = { schema_version: 1, kind: 'mw3-typescript-archive-source-compatibility-review', status: 'approved', scope: 'source-only-no-strategy-or-runtime-renewal',
    baseline_commit: 'df2370690e9b3172f2c109f80113b320880f940a', source_head_sha: 'a'.repeat(40), reviewer: 'synthetic test only', requested_model: 'gpt-6.1-sol',
    runtime_model_attestation: 'unavailable in synthetic fixture', inventory_sha256: sha(readFileSync(join(root, INVENTORY))), adapter_sha256: sha("synthetic old adapter bytes"),
    evidence_sha256: sha(readFileSync(join(root, EVIDENCE))), source_count: 152, extra_current_paths: [...EXTRAS] };
  put(root, REVIEW, json(review));
  const validator=readFileSync(new URL('../../../'+EXTENSION,import.meta.url));put(root,EXTENSION,validator);
  const extensionProposal={schema_version:1,kind:'mw3-verification-preservation-extension-proposal',status:'source-only-proposal',scope:'verification-preservation-only-no-numerical-or-gto-renewal',author_task:'/root/production_path',rows:PRESERVATION_PATHS.map(path=>({classification:'verification-preservation-extension',prior:rows.find(row=>row.current.path===path).current,current:{path,bytes:readFileSync(join(root,path)).length,sha256:sha(readFileSync(join(root,path)))}}))};
  put(root,EXT_PROPOSAL,json(extensionProposal));put(root,EXT_BASELINE,json({schema_version:1,kind:'mw3-preservation-legacy-adapter-bytes',path:ADAPTER,source:'synthetic old adapter bytes'}));
  const extensionReview={schema_version:1,kind:'mw3-verification-preservation-extension-review',status:'approved',scope:extensionProposal.scope,reviewer:'synthetic contract fixture only',reviewer_task:'/synthetic-independent-review-not-real-approval',reviewer_model:'not-exposed',proposal_sha256:sha(readFileSync(join(root,EXT_PROPOSAL))),adapter_sha256:sha(helper),validator_sha256:sha(validator),baseline_snapshot_sha256:sha(readFileSync(join(root,EXT_BASELINE))),legacy_inventory_sha256:sha(readFileSync(join(root,INVENTORY))),legacy_review_sha256:sha(readFileSync(join(root,REVIEW))),legacy_evidence_sha256:sha(readFileSync(join(root,EVIDENCE))),notes:['Synthetic fixture only; no real approval.']};put(root,EXT_REVIEW,json(extensionReview));
  const operatorValidator=readFileSync(new URL('../../../'+OP_EXTENSION,import.meta.url));put(root,OP_EXTENSION,operatorValidator);
  put(root,OP_BASELINE,json({schema_version:1,kind:'mw3-operator-preservation-prior-adapter-bytes',path:ADAPTER,source:helper.toString('utf8')}));
  const operatorProposal={schema_version:1,kind:'mw3-operator-preservation-extension-proposal',status:'source-only-proposal',scope:'operator-batch-verification-preservation-only-no-numerical-or-gto-renewal',author_task:'/root/parallel_safety_review',rows:extensionProposal.rows.map(row=>{const body=Buffer.from('synthetic operator preservation '+row.current.path);put(root,row.current.path,body);return {classification:'operator-preservation-extension',prior:row.current,current:{path:row.current.path,bytes:body.length,sha256:sha(body)}};})};
  put(root,OP_PROPOSAL,json(operatorProposal));
  const operatorReview={schema_version:1,kind:'mw3-operator-preservation-extension-review',status:'approved',scope:operatorProposal.scope,reviewer:'Synthetic source-only test fixture',reviewer_task:'/synthetic-independent-operator-review',reviewer_model:'not-exposed',proposal_sha256:sha(readFileSync(join(root,OP_PROPOSAL))),adapter_sha256:sha(helper),validator_sha256:sha(operatorValidator),baseline_snapshot_sha256:sha(readFileSync(join(root,OP_BASELINE))),prior_proposal_sha256:sha(readFileSync(join(root,EXT_PROPOSAL))),prior_review_sha256:sha(readFileSync(join(root,EXT_REVIEW))),notes:['Synthetic contract fixture only, not actual acceptance.']};put(root,OP_REVIEW,json(operatorReview));
  return { operatorProposal, operatorReview, extensionProposal, extensionReview, root, inventory, rows, evidence, review, saveInventory: () => { put(root, INVENTORY, json(inventory)); review.inventory_sha256 = sha(readFileSync(join(root, INVENTORY))); put(root, REVIEW, json(review)); },
    saveReview: () => put(root, REVIEW, json(review)), load: () => import(pathToFileURL(join(root, ADAPTER)).href) };
}

test('synthetic approved inventory maps exact historical manifest paths to current bytes', async t => {
  const f = fixture(t), api = await f.load();
  const sourceRows = f.rows.slice(0, 8), currentPaths = [...sourceRows.map(row => row.current.path), ...CURRENT_EXTRAS].sort();
  const manifestSources = sourceRows.map(row => row.historical).sort((a, b) => a.path.localeCompare(b.path));
  api.verifyMw3ArchivedSourceInventory(currentPaths, manifestSources);
  assert.deepEqual([...api.mw3ArchivedRecipeSources('CO_open_BTN_call_BB_call', readFileSync(join(f.root, f.inventory.accepted_manifests[0].manifest.path))).keys()].sort(), [...RECIPE_PATHS].sort());
  assert.doesNotMatch(readFileSync(new URL('../scripts/data/mw3-authored/registry.ts', import.meta.url), 'utf8'), /mw3ArchivedRecipeSources/);
});

for (const [name, mutate] of [
  ['unknown current path', async (f, api) => assert.throws(() => api.verifyMw3ArchivedSourceInventory([...f.rows.slice(0, 1).map((r:any) => r.current.path), ...CURRENT_EXTRAS, 'unreviewed/file.ts'], [f.rows[0].historical]), /source identity/)],
  ['missing overlay dependency', async (f, api) => assert.throws(() => api.verifyMw3ArchivedSourceInventory(f.rows.slice(0, 1).map((r:any) => r.current.path), [f.rows[0].historical]), /source identity/)],
  ['changed current file', async (f, api) => { const row = f.rows[0]; put(f.root, row.current.path, 'mutated'); assert.throws(() => api.verifyMw3ArchivedSourceInventory([row.current.path, ...CURRENT_EXTRAS], [row.historical]), /source identity/); }],
  ['changed historical record', async (f, api) => assert.throws(() => api.verifyMw3ArchivedSourceInventory([f.rows[0].current.path, ...CURRENT_EXTRAS], [{ ...f.rows[0].historical, sha256: '0'.repeat(64) }]), /source identity/)],
  ['changed evidence', async (f, api) => { put(f.root, EVIDENCE, '{}\n'); assert.throws(() => api.verifyMw3ArchivedSourceInventory([f.rows[0].current.path, ...CURRENT_EXTRAS], [f.rows[0].historical]), /source identity/); }],
  ['unapproved review', async (f, api) => { f.review.status = 'pending'; f.saveReview(); assert.throws(() => api.verifyMw3ArchivedSourceInventory([f.rows[0].current.path, ...CURRENT_EXTRAS], [f.rows[0].historical]), /source identity/); }],
  ['eleventh current extra', async (f, api) => { f.review.extra_current_paths.push('unreviewed/extra.ts'); f.saveReview(); assert.throws(() => api.verifyMw3ArchivedSourceInventory([f.rows[0].current.path, ...CURRENT_EXTRAS], [f.rows[0].historical]), /source identity/); }],
  ['changed pinned extra', async (f, api) => { const path = f.inventory.extra_current_sources[0].path; put(f.root, path, 'changed'); assert.throws(() => api.verifyMw3ArchivedSourceInventory([f.rows[0].current.path, ...CURRENT_EXTRAS], [f.rows[0].historical]), /source identity/); }],
  ['changed recipe bytes', async (f, api) => { const bytes = readFileSync(join(f.root, f.inventory.accepted_manifests[0].manifest.path)); assert.throws(() => api.mw3ArchivedRecipeSources('CO_open_BTN_call_BB_call', Buffer.concat([bytes, Buffer.from('x')])), /source identity/); }],
  ['unknown accepted manifest', async (f, api) => assert.throws(() => api.assertMw3AcceptedArchive('future_spot', Buffer.from('{}')), /source identity/)],
  ['changed receipt bytes', async (f, api) => { const row = f.inventory.accepted_manifests[0]; put(f.root, row.receipt.path, 'changed'); assert.throws(() => api.assertMw3AcceptedArchive(row.spot, readFileSync(join(f.root, row.manifest.path))), /source identity/); }],
  ['changed accepted artifact', async (f, api) => assert.throws(() => api.assertMw3AcceptedArtifactBytes('CO_open_BTN_call_BB_call', new Map([['unknown', Buffer.from('x')]])), /source identity/)],
] as [string, (f: any, api: any) => Promise<void>][]) test(`synthetic archive adapter rejects ${name}`, async t => { const f = fixture(t), api = await f.load(); await mutate(f, api); });

// Synthetic addendum authority exists only in each temporary fixture, never in
// a normal repository receipt. Functional preservation is not TS/AST parity.
for(const [name,mutate] of [
 ['wrong prior pin',(f:any)=>{f.extensionProposal.rows[0].prior.sha256='0'.repeat(64);}],
 ['fake extension path',(f:any)=>{f.extensionProposal.rows[0].current.path='unreviewed/arbitrary.ts';}],
 ['relabelled TypeScript parity',(f:any)=>{f.extensionProposal.rows[0].classification='typescript-source-parity';}],
 ['third extension row',(f:any)=>{f.extensionProposal.rows.push(structuredClone(f.extensionProposal.rows[0]));}],
] as [string,(f:any)=>void][])test(`synthetic preservation addendum rejects ${name} even with matching proposal digest`,async t=>{
 const f=fixture(t);mutate(f);put(f.root,EXT_PROPOSAL,json(f.extensionProposal));f.extensionReview.proposal_sha256=sha(readFileSync(join(f.root,EXT_PROPOSAL)));put(f.root,EXT_REVIEW,json(f.extensionReview));
 const api=await f.load();assert.throws(()=>api.mw3ApprovedCurrentSourceRecords(),/source identity/);
});
for(const [name,mutate] of [
 ['new adapter hash',(f:any)=>{f.extensionReview.adapter_sha256='0'.repeat(64);put(f.root,EXT_REVIEW,json(f.extensionReview));}],
 ['pending review',(f:any)=>{f.extensionReview.status='pending-independent-review';put(f.root,EXT_REVIEW,json(f.extensionReview));}],
 ['self review',(f:any)=>{f.extensionReview.reviewer_task='/root/production_path';put(f.root,EXT_REVIEW,json(f.extensionReview));}],
 ['original receipt drift',(f:any)=>{put(f.root,REVIEW,Buffer.concat([readFileSync(join(f.root,REVIEW)),Buffer.from(' ')]));}],
 ['unrelated legacy source drift',(f:any)=>{const row=f.rows.find((r:any)=>r.classification==='exact-byte-identity');put(f.root,row.current.path,'unapproved source drift');}],
] as [string,(f:any)=>void][])test(`synthetic preservation addendum rejects ${name}`,async t=>{
 const f=fixture(t);mutate(f);const api=await f.load();assert.throws(()=>api.mw3ApprovedCurrentSourceRecords(),/source identity/);
});
test('synthetic preservation addendum returns exact two new current pins and retains all legacy manifest pins',async t=>{
 const f=fixture(t),api=await f.load(),records=api.mw3ApprovedCurrentSourceRecords();
 for(const path of PRESERVATION_PATHS){const actual=readFileSync(join(f.root,path)),pin=records.find((r:any)=>r.path===path);assert.deepEqual(pin,{path,bytes:actual.length,sha256:sha(actual)});}
 for(const path of EXT_EXTRAS)assert.equal(records.filter((r:any)=>r.path===path).length,1);
 assert.equal(f.inventory.rows.length,152);assert.equal(f.inventory.accepted_manifests.length,16);assert.equal(f.inventory.archived_recipe_sources.length,4);
});

for(const[name,mutate]of [
 ['prior pin',(f:any)=>{f.operatorProposal.rows[0].prior.sha256='0'.repeat(64);}],
 ['third path',(f:any)=>{f.operatorProposal.rows.push(structuredClone(f.operatorProposal.rows[0]));}],
 ['changed helper path',(f:any)=>{f.operatorProposal.rows[0].current.path='unreviewed/new.ts';}],
 ['parity relabelling',(f:any)=>{f.operatorProposal.rows[0].classification='typescript-source-parity';}],
]as[string,(f:any)=>void][])test(`synthetic operator preservation rejects ${name} even with matching digest`,async t=>{
 const f=fixture(t);mutate(f);put(f.root,OP_PROPOSAL,json(f.operatorProposal));f.operatorReview.proposal_sha256=sha(readFileSync(join(f.root,OP_PROPOSAL)));put(f.root,OP_REVIEW,json(f.operatorReview));const api=await f.load();assert.throws(()=>api.mw3ApprovedCurrentSourceRecords(),/source identity/);
});
for(const[name,mutate]of [
 ['self review',(f:any)=>{f.operatorReview.reviewer_task='/root/parallel_safety_review';}],
 ['pending review',(f:any)=>{f.operatorReview.status='pending';}],
 ['prior authority drift',(f:any)=>{put(f.root,EXT_REVIEW,Buffer.concat([readFileSync(join(f.root,EXT_REVIEW)),Buffer.from(' ')]));}],
 ['prior adapter snapshot drift',(f:any)=>{const b=JSON.parse(readFileSync(join(f.root,OP_BASELINE),'utf8'));b.source+=' ';put(f.root,OP_BASELINE,json(b));f.operatorReview.baseline_snapshot_sha256=sha(readFileSync(join(f.root,OP_BASELINE)));}],
 ['validator drift',(f:any)=>{put(f.root,OP_EXTENSION,Buffer.concat([readFileSync(join(f.root,OP_EXTENSION)),Buffer.from('\n')]));}],
]as[string,(f:any)=>void][])test(`synthetic operator preservation rejects ${name}`,async t=>{
 const f=fixture(t);mutate(f);put(f.root,OP_REVIEW,json(f.operatorReview));const api=await f.load();assert.throws(()=>api.mw3ApprovedCurrentSourceRecords(),/source identity/);
});
test('synthetic operator preservation returns second exact pins and both authority dependency sets',async t=>{
 const f=fixture(t),api=await f.load(),records=api.mw3ApprovedCurrentSourceRecords();for(const row of f.operatorProposal.rows)assert.deepEqual(records.find((r:any)=>r.path===row.current.path),row.current);for(const path of [...EXT_EXTRAS,...OP_EXTRAS])assert.equal(records.filter((r:any)=>r.path===path).length,1);assert.equal(records.length,171);
});
