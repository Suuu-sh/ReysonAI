// Isolated verifier setup only. Reviewed delivery SQL keeps its existing,
// streaming statement parser and never acquires procedural SQL support.
import assert from 'node:assert/strict';
import { sqlStatements } from '../verify-preflop-local-d1.mjs';

const content = text => text.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/, '');
const triggerEnd = /^END(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*;?\s*$/i;

// SQLite trigger bodies contain statement terminators inside BEGIN ... END.
// The delivery parser already handles comments, quoted semicolons and escapes;
// join only CREATE TRIGGER fragments through the standalone closing END.
export async function* backendMigrationStatements(path) {
  let trigger = '';
  for await (const statement of sqlStatements(path)) {
    if (trigger) {
      trigger += statement;
      if (triggerEnd.test(content(statement))) {
        yield trigger;
        trigger = '';
      }
    } else if (/^CREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/i.test(content(statement))) {
      trigger = statement;
    } else {
      yield statement;
    }
  }
  assert.equal(trigger, '', 'Unterminated CREATE TRIGGER in backend migration');
}
