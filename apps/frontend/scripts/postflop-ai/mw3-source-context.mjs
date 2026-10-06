// Experimental additive gate. It does not accept/renew legacy MW3 receipts.
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { parse } from '@babel/parser';

const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const fail = message => { throw new Error(`MW3 split context: ${message}`); };
const ordered = rows => [...rows].sort((a, b) => a.path.localeCompare(b.path, 'en'));
const safe = path => typeof path === 'string' && /^[A-Za-z0-9_./-]+$/.test(path) && !path.startsWith('/') && !path.split('/').some(part => !part || part === '.' || part === '..');

// Parse syntax, not comments/string regexes. Types and literal dynamic imports
// are dependencies too. Computed module loads are deliberately unsupported.
export function moduleDependencies(path, body, has, computed = []) {
  if (!/\.(?:mjs|mts|ts|tsx|js)$/.test(path)) return [];
  const ast = parse(body.toString('utf8'), { sourceType: 'unambiguous', plugins: [['typescript', { dts: path.endsWith('.d.mts') }], 'jsx'], createImportExpressions: true });
  const names = [], consumed = new Set();
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) names.push(node.source.value);
    if (node.type === 'TSImportType') names.push(node.argument.value);
    if (node.type === 'ImportExpression' || node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require') {
      const argument = node.type === 'ImportExpression' ? node.source : node.arguments[0];
      if (argument?.type === 'StringLiteral') names.push(argument.value);
      else {
        const expressionHash = digest(body.toString('utf8').slice(argument.start, argument.end));
        const entry = computed.find(row => row.expressionHash === expressionHash);
        if (!entry || !Array.isArray(entry.dependencies) || !entry.dependencies.length) fail(`computed module dependency in ${path}: ${expressionHash}`);
        consumed.add(expressionHash);
        entry.dependencies.forEach(name => names.push(posix.relative(posix.dirname(path), name).startsWith('.') ? posix.relative(posix.dirname(path), name) : './' + posix.relative(posix.dirname(path), name)));
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  if (computed.some(row => !consumed.has(row.expressionHash)) || new Set(computed.map(row => row.expressionHash)).size !== computed.length) fail(`stale/duplicate computed dependency declaration in ${path}`);
  const paths = names.filter(name => name.startsWith('.')).map(name => posix.normalize(posix.join(posix.dirname(path), name)));
  if (path.endsWith('.mjs') && has(path.slice(0, -4) + '.d.mts')) paths.push(path.slice(0, -4) + '.d.mts');
  for (const dependency of paths) if (!safe(dependency) || !has(dependency)) fail(`missing/unsafe dependency ${path} -> ${dependency}`);
  return [...new Set(paths)].sort();
}

export function collectSourceContexts(files, policy) {
  if (policy?.schema !== 1 || !policy.roots || !policy.owners || !policy.resources) fail('invalid classification policy');
  const graph = new Map(), reach = new Map();
  function walk(path, scope) {
    if (!safe(path) || !files.has(path)) fail(`missing/unsafe source ${path}`);
    if (!['numerical', 'ui'].includes(policy.owners[path])) fail(`unclassified dependency ${path}`);
    if (scope === 'numerical' && policy.owners[path] !== 'numerical') fail(`numerical closure depends on UI ${path}`);
    const reached = reach.get(path) ?? new Set();
    if (reached.has(scope)) return;
    reached.add(scope); reach.set(path, reached);
    const dependencies = [...new Set([...moduleDependencies(path, files.get(path), name => files.has(name), policy.computed?.[path] ?? []), ...(policy.resources[path] ?? [])])].sort();
    graph.set(path, dependencies);
    dependencies.forEach(name => walk(name, scope));
  }
  for (const scope of ['numerical', 'ui']) {
    if (!Array.isArray(policy.roots[scope]) || !policy.roots[scope].length) fail(`missing ${scope} roots`);
    policy.roots[scope].forEach(path => walk(path, scope));
  }
  for (const path of Object.keys(policy.owners)) if (!reach.has(path)) fail(`unreachable classified source ${path}`);
  for (const path of Object.keys(policy.computed ?? {})) if (!reach.has(path)) fail(`unreachable computed declaration ${path}`);
  for (const path of Object.keys(policy.resources)) if (!reach.has(path)) fail(`unreachable resource declaration ${path}`);
  // Numeric ownership cannot be downgraded to UI while remaining reachable
  // from numeric roots. Shared dependencies belong to the numerical context;
  // the UI closure uses explicit bridges, joined with its approved digest.
  const contexts = {};
  for (const scope of ['numerical', 'ui']) {
    const paths = [...reach.keys()].filter(path => policy.owners[path] === scope).sort();
    const records = ordered(paths.map(path => ({ path, bytes: files.get(path).length, sha256: digest(files.get(path)) })));
    const edges = paths.map(path => ({ path, dependencies: graph.get(path) }));
    const bridges = scope === 'ui' ? [...new Set(edges.flatMap(row => row.dependencies).filter(path => policy.owners[path] === 'numerical'))].sort() : [];
    const contract = { schema: 1, scope, roots: [...policy.roots[scope]].sort(), records, edges, bridges };
    contexts[scope] = { ...contract, digest: digest(contract) };
  }
  return { schema: 1, status: 'unapproved-proposal', contexts };
}

// Receipt authority is external independent review; this module cannot mint it.
// The expected receipt must come from a protected/trusted review channel.
export function verifyContextReceipt(context, receipt, scope) {
  const { digest: supplied, ...contract } = context ?? {};
  if (digest(contract) !== supplied) fail(`tampered ${scope} context`);
  if (context?.scope !== scope || receipt?.schema !== 1 || receipt.status !== 'approved' || receipt.scope !== scope ||
      receipt.digest !== context.digest || typeof receipt.reviewer !== 'string' || !receipt.reviewer.trim() ||
      typeof receipt.reviewId !== 'string' || !receipt.reviewId.trim()) fail(`missing or stale ${scope} approval`);
  return context.digest;
}

export function verifyIntegrationContexts(proposal, receipts, sourceTree, verifyTree) {
  if (!/^[a-f0-9]{40}$/.test(sourceTree) || typeof verifyTree !== 'function') fail('committed integration tree required');
  const numerical = verifyContextReceipt(proposal.contexts.numerical, receipts.numerical, 'numerical');
  const ui = verifyContextReceipt(proposal.contexts.ui, receipts.ui, 'ui');
  verifyTree(sourceTree, [...proposal.contexts.numerical.records, ...proposal.contexts.ui.records]);
  return { schema: 1, sourceTree, numerical, ui, digest: digest({ sourceTree, numerical, ui }) };
}
