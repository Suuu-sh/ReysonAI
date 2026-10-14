import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { ensureHumanAvatarSchema } from '../scripts/ensure-human-avatar-schema.mjs';

const sql = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');

test('avatar schema applies once, reads back, and never touches player rank data', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(sql('0007_accounts.sql')); db.exec(sql('0011_human_ranked.sql'));
    db.prepare('INSERT INTO account_users VALUES (?,?,?,?)').run('U0', 'subject', 'synthetic@example.invalid', 1);
    db.prepare('INSERT INTO human_rank_players(user_id,public_id,public_name,rating,hands) VALUES (?,?,?,?,?)').run('U0', 'P0', 'Player 0', 1234, 12);
    let applies = 0;
    const options = { columns: () => db.prepare('PRAGMA table_info(human_rank_players)').all(), apply: () => { applies++; db.exec(sql('0013_human_rank_avatar.sql')); } };
    assert.equal(await ensureHumanAvatarSchema(options), 'applied');
    assert.equal(await ensureHumanAvatarSchema(options), 'already-applied');
    assert.equal(applies, 1);
    assert.deepEqual({ ...db.prepare('SELECT avatar,rating,hands FROM human_rank_players WHERE user_id=?').get('U0') }, { avatar: 'person', rating: 1234, hands: 12 });
  } finally { db.close(); }
});

test('missing base schema or incompatible avatar column fails without writes', async () => {
  const db = new DatabaseSync(':memory:');
  let applies = 0;
  const options = { columns: () => db.prepare('PRAGMA table_info(human_rank_players)').all(), apply: () => { applies++; } };
  try {
    await assert.rejects(ensureHumanAvatarSchema(options), /base schema is missing/);
    db.exec('CREATE TABLE human_rank_players(user_id TEXT, public_id TEXT, public_name TEXT, phase TEXT, avatar TEXT)');
    await assert.rejects(ensureHumanAvatarSchema(options), /differs from the reviewed schema/);
    assert.equal(applies, 0);
  } finally { db.close(); }
});
