// AST extraction keeps comments, escaped specifiers and TypeScript import types
// distinct from code. The parser is vendored so captured verification never
// consults a live package installation outside its exact-buffer source ledger.
import { createHash } from 'node:crypto';
import parser from './vendor/babel-parser-7.29.7.mjs';
export const MW3_IMPORT_PARSER_RECORDS = [
  'apps/frontend/scripts/postflop-ai/vendor/babel-parser-7.29.7.license.json',
  'apps/frontend/scripts/postflop-ai/vendor/babel-parser-7.29.7.provenance.json',
];
const cache = new Map();
const sha256 = text => createHash('sha256').update(text).digest('hex');
const bootstrap = Object.freeze({
  path: 'apps/frontend/scripts/verify-mw3-local-d1.mjs',
  sha256: 'e3959bbb7026fa34fdee7bf402f53a65fb17d987e4c062e89eb7cd5148e45f51',
  expression: 'pathToFileURL(join(captured.root, PARENT_ENTRY)).href',
  target: 'apps/frontend/scripts/ci/mw3-local-d1-oracle.mjs',
});
export function mw3SourceDependencies(path, text) {
  const hash = sha256(text), prior = cache.get(path);
  if (prior?.hash === hash) return prior.dependencies;
  const fail = reason => { throw new Error(`Mw3 source dependency cannot be statically bound: ${path}: ${reason}`); };
  let ast;
  try {
    ast = parser.parse(text, { sourceType: 'module', sourceFilename: path, createImportExpressions: true,
      plugins: /\.(?:ts|mts)$/.test(path) ? [['typescript', { dts: /\.d\.(?:ts|mts)$/.test(path) }]] : [] });
  } catch (error) { fail(`invalid or unsupported syntax (${error.message})`); }
  const dependencies = [], stack = [ast];
  const literal = node => node?.type === 'StringLiteral' ? node.value
    : node?.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[0].value.cooked : null;
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    const source = ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type) ? node.source
      : node.type === 'TSImportType' ? node.argument
      : node.type === 'TSExternalModuleReference' ? node.expression : null;
    if (source) {
      const specifier = literal(source);
      if (typeof specifier === 'string') {
        if (specifier.startsWith('/') || specifier.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(specifier) && !specifier.startsWith('node:')) fail('absolute, rooted or URL module reference is unsupported');
        if (specifier.includes('?') || specifier.includes('#')) fail('module query/fragment is outside the source ledger');
        if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) fail('extensionless relative import is unsupported');
        dependencies.push(Object.freeze({ specifier }));
      } else {
        // The sole computed import is the existing immutable strict bootstrap.
        // Its exact bytes ensure captured.root and the exact-buffer loader have
        // their reviewed meaning. Also require its expression and target root.
        const entry = ast.program.body.find(row => row.type === 'VariableDeclaration' && row.declarations.some(decl =>
          decl.id.type === 'Identifier' && decl.id.name === 'PARENT_ENTRY' && literal(decl.init) === bootstrap.target));
        if (node.type !== 'ImportExpression' || path !== bootstrap.path || hash !== bootstrap.sha256 ||
            text.slice(source.start, source.end) !== bootstrap.expression || !entry) fail('computed import requires an explicit exact-source review');
        dependencies.push(Object.freeze({ path: bootstrap.target }));
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (['loc', 'comments', 'tokens', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
      if (Array.isArray(child)) stack.push(...child);
      else if (child && typeof child === 'object') stack.push(child);
    }
  }
  const result = Object.freeze(dependencies);
  cache.set(path, { hash, dependencies: result });
  return result;
}
