import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { startRankedMatch } from '../src/application/ranked-match-start.ts';
import { sampleRankedQuestions } from '../src/domain/ranked-quiz.ts';
import { D1RankedMatchStartRepository } from '../src/infrastructure/d1-ranked-match-start-repository.ts';

const questions = Array.from({ length: 20 }, (_, index) => ({
  spotId: `spot-${index}`, hand: 'AsKs', mix: { fold: 0.4, open: 0.6 },
}));
const activeMatch = { id: 'existing-id', user_id: 'owner', questions_json: JSON.stringify(questions), status: 'active', expires_at: 20_000 };

test('weighted Ranked sampling preserves 20 draws, boundary behavior and public question shape', () => {
  const pool = [
    { spotId: 'heavy', hand: 'AsKs', mix: { fold: 1 }, weight: 3 },
    { spotId: 'light', hand: 'AsKh', mix: { open: 1 }, weight: 1 },
  ];
  const draws = Array.from({ length: 20 }, (_, index) => index % 2 === 0 ? 0 : 0.75);
  let calls = 0;
  const sampled = sampleRankedQuestions(pool, () => draws[calls++]);

  assert.equal(calls, 20);
  assert.deepEqual(sampled.map(question => question.spotId), Array.from({ length: 20 }, (_, index) => index % 2 === 0 ? 'heavy' : 'light'));
  assert.equal(Object.hasOwn(sampled[0], 'weight'), false);
  assert.deepEqual(sampled[1], { spotId: 'light', hand: 'AsKh', mix: { open: 1 } });
});

test('Ranked start preserves player, expiry, active reuse and ID generation order', async () => {
  const events = [];
  const repository = {
    async ensurePlayer(userId, publicName) { events.push(['ensure-player', userId, publicName]); },
    async expireActiveMatches(userId, now) { events.push(['expire', userId, now]); },
    async findActiveMatch(userId) { events.push(['find-active', userId]); return activeMatch; },
    async reserveDailyStart() { events.push(['reserve']); return null; },
  };
  const result = await startRankedMatch(repository, {
    userId: 'owner', day: '2026-10-11', now: 10_000, publicName: 'Player abc12345', questions, dailyLimit: 3,
  }, () => { events.push(['create-id']); return 'new-id'; });

  assert.deepEqual(result, { kind: 'existing', match: activeMatch });
  assert.deepEqual(events, [
    ['ensure-player', 'owner', 'Player abc12345'], ['expire', 'owner', 10_000], ['find-active', 'owner'],
  ]);
});

test('Ranked start reserves after the active check and reloads after an insert race', async () => {
  const events = [];
  const racedMatch = { ...activeMatch, id: 'race-winner' };
  const repository = {
    async ensurePlayer() { events.push('ensure-player'); },
    async expireActiveMatches() { events.push('expire'); },
    async findActiveMatch() { events.push('find-active'); return events.filter(value => value === 'find-active').length === 1 ? null : racedMatch; },
    async reserveDailyStart(input) { events.push(['reserve', input]); return null; },
  };
  const result = await startRankedMatch(repository, {
    userId: 'owner', day: '2026-10-11', now: 10_000, publicName: 'Player abc12345', questions, dailyLimit: 3,
  }, () => { events.push('create-id'); return 'new-id'; });

  assert.deepEqual(result, { kind: 'existing', match: racedMatch });
  assert.deepEqual(events.map(event => Array.isArray(event) ? event[0] : event), [
    'ensure-player', 'expire', 'find-active', 'create-id', 'reserve', 'find-active',
  ]);
  assert.deepEqual(events[4][1], {
    id: 'new-id', userId: 'owner', day: '2026-10-11', now: 10_000, expiresAt: 3_610_000,
    questionsJson: JSON.stringify(questions), dailyLimit: 3,
  });
});

test('Ranked start reports quota exhaustion only after insert and race fallback both miss', async () => {
  const events = [];
  const repository = {
    async ensurePlayer() { events.push('ensure-player'); },
    async expireActiveMatches() { events.push('expire'); },
    async findActiveMatch() { events.push('find-active'); return null; },
    async reserveDailyStart() { events.push('reserve'); return null; },
  };
  const result = await startRankedMatch(repository, {
    userId: 'owner', day: '2026-10-11', now: 10_000, publicName: 'Player abc12345', questions, dailyLimit: 3,
  }, () => { events.push('create-id'); return 'new-id'; });

  assert.deepEqual(result, { kind: 'daily_limit' });
  assert.deepEqual(events, ['ensure-player', 'expire', 'find-active', 'create-id', 'reserve', 'find-active']);
});

test('D1 Ranked start adapter keeps owner filters, exact quota SQL and SQLite slot/active constraints', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys=ON');
    for (const name of ['0007_accounts.sql', '0009_ranked.sql']) {
      sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
    }
    sqlite.prepare('INSERT INTO account_users VALUES (?,?,?,?)').run('owner', 'google-owner', 'owner@example.invalid', 0);
    sqlite.prepare('INSERT INTO account_users VALUES (?,?,?,?)').run('other', 'google-other', 'other@example.invalid', 0);

    const sqlCalls = [];
    const db = {
      prepare(sql) {
        let values = [];
        return {
          bind(...args) { values = args; return this; },
          async all() {
            sqlCalls.push({ sql, values });
            return { results: sqlite.prepare(sql).all(...values) };
          },
        };
      },
    };
    const repository = new D1RankedMatchStartRepository(db);
    await repository.ensurePlayer('owner', 'Player abc12345');
    await repository.expireActiveMatches('owner', 10_000);
    assert.equal(await repository.findActiveMatch('other'), null);
    const started = await repository.reserveDailyStart({
      id: 'match-1', userId: 'owner', day: '2026-10-11', now: 10_000, expiresAt: 3_610_000,
      questionsJson: JSON.stringify(questions), dailyLimit: 3,
    });
    assert.equal(started.id, 'match-1');
    assert.equal(started.status, 'active');
    assert.deepEqual(await repository.findActiveMatch('owner'), started);

    assert.equal(await repository.reserveDailyStart({
      id: 'match-2', userId: 'owner', day: '2026-10-11', now: 10_001, expiresAt: 3_610_001,
      questionsJson: JSON.stringify(questions), dailyLimit: 3,
    }), null);
    await repository.expireActiveMatches('owner', 3_610_000);
    const second = await repository.reserveDailyStart({
      id: 'match-2', userId: 'owner', day: '2026-10-11', now: 3_610_000, expiresAt: 7_210_000,
      questionsJson: JSON.stringify(questions), dailyLimit: 3,
    });
    assert.equal(second.slot, 2);
    await repository.expireActiveMatches('owner', 7_210_000);
    const third = await repository.reserveDailyStart({
      id: 'match-3', userId: 'owner', day: '2026-10-11', now: 7_210_000, expiresAt: 10_810_000,
      questionsJson: JSON.stringify(questions), dailyLimit: 3,
    });
    assert.equal(third.slot, 3);
    await repository.expireActiveMatches('owner', 10_810_000);
    assert.equal(await repository.reserveDailyStart({
      id: 'match-4', userId: 'owner', day: '2026-10-11', now: 10_810_000, expiresAt: 14_410_000,
      questionsJson: JSON.stringify(questions), dailyLimit: 3,
    }), null);
    assert.equal(await repository.findActiveMatch('owner'), null);

    assert.deepEqual(sqlCalls, [
      { sql: 'INSERT OR IGNORE INTO ranked_players(user_id,public_name) VALUES (?,?)', values: ['owner', 'Player abc12345'] },
      { sql: "UPDATE ranked_matches SET status='expired' WHERE user_id=? AND status='active' AND expires_at<=?", values: ['owner', 10_000] },
      { sql: "SELECT * FROM ranked_matches WHERE user_id=? AND status='active'", values: ['other'] },
      { sql: 'INSERT OR IGNORE INTO ranked_matches(id,user_id,day,slot,started_at,expires_at,questions_json) SELECT ?,?,?,COUNT(*)+1,?,?,? FROM ranked_matches WHERE user_id=? AND day=? HAVING COUNT(*)<? RETURNING *', values: ['match-1', 'owner', '2026-10-11', 10_000, 3_610_000, JSON.stringify(questions), 'owner', '2026-10-11', 3] },
      { sql: "SELECT * FROM ranked_matches WHERE user_id=? AND status='active'", values: ['owner'] },
      { sql: 'INSERT OR IGNORE INTO ranked_matches(id,user_id,day,slot,started_at,expires_at,questions_json) SELECT ?,?,?,COUNT(*)+1,?,?,? FROM ranked_matches WHERE user_id=? AND day=? HAVING COUNT(*)<? RETURNING *', values: ['match-2', 'owner', '2026-10-11', 10_001, 3_610_001, JSON.stringify(questions), 'owner', '2026-10-11', 3] },
      { sql: "UPDATE ranked_matches SET status='expired' WHERE user_id=? AND status='active' AND expires_at<=?", values: ['owner', 3_610_000] },
      { sql: 'INSERT OR IGNORE INTO ranked_matches(id,user_id,day,slot,started_at,expires_at,questions_json) SELECT ?,?,?,COUNT(*)+1,?,?,? FROM ranked_matches WHERE user_id=? AND day=? HAVING COUNT(*)<? RETURNING *', values: ['match-2', 'owner', '2026-10-11', 3_610_000, 7_210_000, JSON.stringify(questions), 'owner', '2026-10-11', 3] },
      { sql: "UPDATE ranked_matches SET status='expired' WHERE user_id=? AND status='active' AND expires_at<=?", values: ['owner', 7_210_000] },
      { sql: 'INSERT OR IGNORE INTO ranked_matches(id,user_id,day,slot,started_at,expires_at,questions_json) SELECT ?,?,?,COUNT(*)+1,?,?,? FROM ranked_matches WHERE user_id=? AND day=? HAVING COUNT(*)<? RETURNING *', values: ['match-3', 'owner', '2026-10-11', 7_210_000, 10_810_000, JSON.stringify(questions), 'owner', '2026-10-11', 3] },
      { sql: "UPDATE ranked_matches SET status='expired' WHERE user_id=? AND status='active' AND expires_at<=?", values: ['owner', 10_810_000] },
      { sql: 'INSERT OR IGNORE INTO ranked_matches(id,user_id,day,slot,started_at,expires_at,questions_json) SELECT ?,?,?,COUNT(*)+1,?,?,? FROM ranked_matches WHERE user_id=? AND day=? HAVING COUNT(*)<? RETURNING *', values: ['match-4', 'owner', '2026-10-11', 10_810_000, 14_410_000, JSON.stringify(questions), 'owner', '2026-10-11', 3] },
      { sql: "SELECT * FROM ranked_matches WHERE user_id=? AND status='active'", values: ['owner'] },
    ]);
    const saved = sqlite.prepare('SELECT id,user_id,day,slot,started_at,expires_at,status,questions_json FROM ranked_matches ORDER BY slot').all();
    assert.deepEqual(saved.map(row => ({ ...row })), [1, 2, 3].map((slot, index) => ({
      id: `match-${slot}`, user_id: 'owner', day: '2026-10-11', slot, started_at: 10_000 + index * 3_600_000,
      expires_at: 3_610_000 + index * 3_600_000, status: 'expired', questions_json: JSON.stringify(questions),
    })));
  } finally {
    sqlite.close();
  }
});
