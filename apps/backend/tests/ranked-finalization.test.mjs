import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { finalizeRankedMatch } from '../src/application/ranked-finalization.ts';
import { D1RankedFinalizationRepository } from '../src/infrastructure/d1-ranked-finalization-repository.ts';
import { gradeRanked } from '../src/domain/ranked-quiz.ts';
import { rateMatch } from '../../shared/ranked-rules.ts';

const now = 10_000;
const actions = Array(20).fill('fold');
const questions = Array.from({ length: 20 }, () => ({ spotId: 's', hand: 'AsKs', mix: { fold: 1, open: 0 } }));
const activeMatch = (overrides = {}) => ({
  id: 'match-id', user_id: 'owner', questions_json: JSON.stringify(questions), actions_json: null,
  status: 'active', expires_at: now + 1, completed_at: 0, before_rating: 0, after_rating: 0, score: 0,
  ...overrides,
});
const player = { user_id: 'owner', public_name: 'Test Player', rating: 1000, peak: 1000, matches: 0 };
test('Ranked finalization grades before replay, expiry and CAS decisions', async () => {
  const completed = activeMatch({ status: 'complete', actions_json: JSON.stringify(actions), score: 18 });
  // Use an explicit event log because repository methods must not depend on their receiver.
  const events = [];
  const repository = {
    async loadOwnedMatch() { events.push('load-owned'); return completed; },
    async loadPlayer() { events.push('load-player'); return player; },
    async compareAndFinalize() { events.push('compare-and-finalize'); },
    async reloadOwnedMatch() { events.push('reload-owned'); return completed; },
  };
  const replayResult = await finalizeRankedMatch(repository, 'owner', 'match-id', actions, now);
  assert.equal(replayResult.kind, 'finalized');
  assert.deepEqual(replayResult.match, completed);
  assert.deepEqual(events, ['load-owned']);
  assert.throws(() => gradeRanked(questions, Array(20).fill('not-an-action')), /invalid_action/);
  await assert.rejects(finalizeRankedMatch(repository, 'owner', 'match-id', Array(20).fill('not-an-action'), now), /invalid_action/);

  const expiredEvents = [];
  const expiredRepository = {
    ...repository,
    async loadOwnedMatch() { expiredEvents.push('load-owned'); return activeMatch({ expires_at: now }); },
    async loadPlayer() { expiredEvents.push('load-player'); return player; },
    async compareAndFinalize() { expiredEvents.push('compare-and-finalize'); },
    async reloadOwnedMatch() { expiredEvents.push('reload-owned'); return activeMatch(); },
  };
  assert.deepEqual(await finalizeRankedMatch(expiredRepository, 'owner', 'match-id', actions, now), { kind: 'expired' });
  assert.deepEqual(expiredEvents, ['load-owned']);
});

test('Ranked finalization preserves use-case order and scores only server-loaded questions', async () => {
  const events = [];
  let reloaded;
  const repository = {
    async loadOwnedMatch(matchId, userId) { events.push(['load-owned', matchId, userId]); return activeMatch(); },
    async loadPlayer(userId) { events.push(['load-player', userId]); return player; },
    async compareAndFinalize(input) { events.push(['compare-and-finalize', input]); },
    async reloadOwnedMatch(matchId, userId) {
      events.push(['reload-owned', matchId, userId]);
      reloaded = activeMatch({ status: 'complete', actions_json: JSON.stringify(actions), completed_at: now, score: 20 });
      return reloaded;
    },
  };
  const result = await finalizeRankedMatch(repository, 'owner', 'match-id', actions, now);
  assert.equal(result.kind, 'finalized');
  assert.deepEqual(events.map(event => Array.isArray(event) ? event[0] : event), [
    'load-owned', 'load-player', 'compare-and-finalize', 'reload-owned',
  ]);
  const input = events[2][1];
  assert.deepEqual(input, {
    matchId: 'match-id', userId: 'owner', now, actionsJson: JSON.stringify(actions), beforeRating: 1000,
    afterRating: Math.max(0, rateMatch(1000, gradeRanked(questions, actions))), score: 20,
  });
  assert.deepEqual(result.match, reloaded);
});

test('D1 Ranked adapter keeps owner reads, one conditional update and trigger settlement atomic', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys=ON');
    for (const name of ['0007_accounts.sql', '0009_ranked.sql']) {
      sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
    }
    sqlite.prepare('INSERT INTO account_users VALUES (?,?,?,?)').run('owner', 'google-owner', 'owner@example.invalid', 0);
    sqlite.prepare('INSERT INTO ranked_players(user_id,public_name) VALUES (?,?)').run('owner', 'Test Player');
    sqlite.prepare('INSERT INTO ranked_matches(id,user_id,day,slot,started_at,expires_at,questions_json) VALUES (?,?,?,?,?,?,?)')
      .run('match-id', 'owner', '2026-10-10', 1, now - 100, now + 1, JSON.stringify(questions));

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
    const repository = new D1RankedFinalizationRepository(db);
    const result = await finalizeRankedMatch(repository, 'owner', 'match-id', actions, now);
    assert.equal(result.kind, 'finalized');
    assert.deepEqual(sqlCalls.map(call => call.sql), [
      'SELECT * FROM ranked_matches WHERE id=? AND user_id=?',
      'SELECT * FROM ranked_players WHERE user_id=?',
      "UPDATE ranked_matches SET status='complete',actions_json=?,completed_at=?,before_rating=?,after_rating=?,score=? WHERE id=? AND user_id=? AND status='active' AND expires_at>? AND (SELECT rating FROM ranked_players WHERE user_id=?)=? RETURNING id",
      'SELECT * FROM ranked_matches WHERE id=? AND user_id=?',
    ]);
    assert.deepEqual(sqlCalls[2].values, [JSON.stringify(actions), now, 1000, result.match.after_rating, 20, 'match-id', 'owner', now, 'owner', 1000]);
    assert.equal(sqlCalls.filter(call => call.sql.startsWith('UPDATE ranked_matches')).length, 1);
    assert.deepEqual({ ...sqlite.prepare('SELECT status,actions_json,before_rating,after_rating,score FROM ranked_matches WHERE id=?').get('match-id') }, {
      status: 'complete', actions_json: JSON.stringify(actions), before_rating: 1000,
      after_rating: result.match.after_rating, score: 20,
    });
    const settled = { ...sqlite.prepare('SELECT rating,peak,matches FROM ranked_players WHERE user_id=?').get('owner') };
    assert.deepEqual(settled, { rating: result.match.after_rating, peak: result.match.after_rating, matches: 1 });

    await repository.compareAndFinalize({
      matchId: 'match-id', userId: 'owner', now, actionsJson: JSON.stringify(actions), beforeRating: 1000,
      afterRating: result.match.after_rating, score: 20,
    });
    assert.deepEqual({ ...sqlite.prepare('SELECT rating,peak,matches FROM ranked_players WHERE user_id=?').get('owner') }, settled);
  } finally {
    sqlite.close();
  }
});

test('D1 Ranked finalization rolls back match and player changes when the settlement trigger fails', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys=ON');
    for (const name of ['0007_accounts.sql', '0009_ranked.sql']) {
      sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
    }
    sqlite.prepare('INSERT INTO account_users VALUES (?,?,?,?)').run('owner', 'google-owner', 'owner@example.invalid', 0);
    sqlite.prepare('INSERT INTO ranked_players(user_id,public_name) VALUES (?,?)').run('owner', 'Test Player');
    sqlite.prepare('INSERT INTO ranked_matches(id,user_id,day,slot,started_at,expires_at,questions_json) VALUES (?,?,?,?,?,?,?)')
      .run('match-id', 'owner', '2026-10-10', 1, now - 100, now + 1, JSON.stringify(questions));
    sqlite.exec(`CREATE TRIGGER fail_ranked_settlement BEFORE UPDATE OF rating ON ranked_players
      WHEN NEW.user_id='owner' BEGIN SELECT RAISE(ABORT, 'simulated settlement failure'); END;`);

    const db = {
      prepare(sql) {
        let values = [];
        return {
          bind(...args) { values = args; return this; },
          async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        };
      },
    };
    const repository = new D1RankedFinalizationRepository(db);
    await assert.rejects(finalizeRankedMatch(repository, 'owner', 'match-id', actions, now), /simulated settlement failure/);

    assert.deepEqual({ ...sqlite.prepare('SELECT status,actions_json,completed_at,before_rating,after_rating,score FROM ranked_matches WHERE id=?').get('match-id') }, {
      status: 'active', actions_json: null, completed_at: null, before_rating: null, after_rating: null, score: null,
    });
    assert.deepEqual({ ...sqlite.prepare('SELECT rating,peak,matches FROM ranked_players WHERE user_id=?').get('owner') }, {
      rating: 1000, peak: 1000, matches: 0,
    });
  } finally {
    sqlite.close();
  }
});

test('active match CAS rejects a player rating changed after the application read', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys=ON');
    for (const name of ['0007_accounts.sql', '0009_ranked.sql']) {
      sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
    }
    sqlite.prepare('INSERT INTO account_users VALUES (?,?,?,?)').run('owner', 'google-owner', 'owner@example.invalid', 0);
    sqlite.prepare('INSERT INTO ranked_players(user_id,public_name) VALUES (?,?)').run('owner', 'Test Player');
    sqlite.prepare('INSERT INTO ranked_matches(id,user_id,day,slot,started_at,expires_at,questions_json) VALUES (?,?,?,?,?,?,?)')
      .run('match-id', 'owner', '2026-10-10', 1, now - 100, now + 1, JSON.stringify(questions));

    const sqlCalls = [];
    const db = {
      prepare(sql) {
        let values = [];
        return {
          bind(...args) { values = args; return this; },
          async all() {
            sqlCalls.push(sql);
            // Simulate another writer committing after loadPlayer and before this CAS.
            if (sql.startsWith("UPDATE ranked_matches SET status='complete'")) {
              sqlite.prepare('UPDATE ranked_players SET rating=? WHERE user_id=?').run(1100, 'owner');
            }
            return { results: sqlite.prepare(sql).all(...values) };
          },
        };
      },
    };
    const repository = new D1RankedFinalizationRepository(db);
    assert.deepEqual(await finalizeRankedMatch(repository, 'owner', 'match-id', actions, now), { kind: 'conflict' });
    assert.deepEqual(sqlCalls, [
      'SELECT * FROM ranked_matches WHERE id=? AND user_id=?',
      'SELECT * FROM ranked_players WHERE user_id=?',
      "UPDATE ranked_matches SET status='complete',actions_json=?,completed_at=?,before_rating=?,after_rating=?,score=? WHERE id=? AND user_id=? AND status='active' AND expires_at>? AND (SELECT rating FROM ranked_players WHERE user_id=?)=? RETURNING id",
      'SELECT * FROM ranked_matches WHERE id=? AND user_id=?',
    ]);
    assert.deepEqual({ ...sqlite.prepare('SELECT status,actions_json,completed_at FROM ranked_matches WHERE id=?').get('match-id') }, {
      status: 'active', actions_json: null, completed_at: null,
    });
    assert.deepEqual({ ...sqlite.prepare('SELECT rating,peak,matches FROM ranked_players WHERE user_id=?').get('owner') }, {
      rating: 1100, peak: 1000, matches: 0,
    });
  } finally {
    sqlite.close();
  }
});
