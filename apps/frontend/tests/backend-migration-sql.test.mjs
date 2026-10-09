import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { backendMigrationStatements } from '../scripts/lib/backend-migration-sql.mjs';
import { UNRELATED_SEED } from '../scripts/verify-preflop-local-d1.mjs';

test('backend migration setup preserves comments, quoted semicolons and complete trigger bodies', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'backend-migration-sql-'));
  const db = new DatabaseSync(':memory:');
  try {
    const source = `-- CREATE TRIGGER ignored; comment\r\n
CREATE TABLE fixture (id INTEGER PRIMARY KEY, status TEXT, total INTEGER);
CREATE TABLE notes (body TEXT);
/* leading; comment */ CREATE TRIGGER fixture_finalize AFTER UPDATE OF status ON fixture
WHEN NEW.status = 'complete; /* literal */'
BEGIN
  UPDATE fixture SET total = CASE WHEN total = 0 THEN 7 ELSE 9 END WHERE id = NEW.id;
  -- END; is a comment, not the trigger terminator
  INSERT INTO notes VALUES ('雪; ''quoted'''); /* END; */
END /* closing; comment */;
INSERT INTO fixture VALUES (1, 'active', 0);
UPDATE fixture SET status = 'complete; /* literal */' WHERE id = 1;
-- trailing; comment\n`;
    const path = join(directory, 'migration.sql');
    writeFileSync(path, source);
    const statements = [];
    for await (const statement of backendMigrationStatements(path)) statements.push(statement);
    assert.equal(statements.length, 6);
    assert.equal(statements.join(''), source, 'Migration parsing must retain every original byte');
    assert.ok(statements[2].includes('INSERT INTO notes'));
    assert.match(statements[2], /END \/\* closing; comment \*\/;\s*$/);
    for (const statement of statements) db.exec(statement);
    assert.equal(db.prepare('SELECT total FROM fixture').get().total, 7);
    assert.equal(db.prepare('SELECT body FROM notes').get().body, "雪; 'quoted'");
    writeFileSync(path, 'CREATE TRIGGER unfinished AFTER UPDATE ON fixture BEGIN UPDATE fixture SET total = 1;');
    await assert.rejects(async () => { for await (const _statement of backendMigrationStatements(path)) { /* exhaust parser */ } }, /Unterminated CREATE TRIGGER/);
    writeFileSync(path, "CREATE TABLE invalid (body TEXT); INSERT INTO invalid VALUES ('unterminated);");
    await assert.rejects(async () => { for await (const _statement of backendMigrationStatements(path)) { /* exhaust parser */ } }, /Unterminated SQL literal\/comment/);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('every current backend migration, including ranked_finalize, prepares as intact SQLite statements', async () => {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('../../backend/migrations/', import.meta.url);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    for (const name of readdirSync(migrations).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      for await (const statement of backendMigrationStatements(new URL(name, migrations))) {
        if (statement.trim()) db.exec(statement);
      }
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().count, 28);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = 'postflop_profile_policies'").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'trigger' AND name = 'ranked_finalize'").get().count, 1);
    db.exec(UNRELATED_SEED);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    db.exec("INSERT INTO ranked_matches (id, user_id, day, slot, started_at, expires_at, questions_json) VALUES ('trigger-probe', 'local-user', '2000-01-02', 2, 0, 1, '[]')");
    db.exec("UPDATE ranked_matches SET status = 'complete', after_rating = 1300 WHERE id = 'trigger-probe'");
    assert.deepEqual({ ...db.prepare("SELECT rating, peak, matches FROM ranked_players WHERE user_id = 'local-user'").get() }, { rating: 1300, peak: 1300, matches: 2 });
  } finally { db.close(); }
});
