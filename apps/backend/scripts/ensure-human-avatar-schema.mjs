#!/usr/bin/env node
// Apply only the reviewed human-avatar column, and only when it is absent.
// This is deliberately not `migrations apply`: unrelated pending migrations stay untouched.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backend = fileURLToPath(new URL('..', import.meta.url));
const migration = 'migrations/0013_human_rank_avatar.sql';
const required = ['user_id', 'public_id', 'public_name', 'phase'];

function validAvatarColumn(column) {
  return column?.type?.toUpperCase() === 'TEXT' && column.notnull === 1 && /^'person'$/i.test(column.dflt_value ?? '');
}

export async function ensureHumanAvatarSchema({ columns, apply }) {
  const before = await columns();
  if (!Array.isArray(before) || required.some(name => !before.some(column => column.name === name))) {
    throw new Error('Human-ranked base schema is missing; avatar migration was not run');
  }
  const existing = before.find(column => column.name === 'avatar');
  if (existing) {
    if (!validAvatarColumn(existing)) throw new Error('Existing avatar column differs from the reviewed schema');
    return 'already-applied';
  }
  await apply();
  const after = await columns();
  if (!Array.isArray(after) || !validAvatarColumn(after.find(column => column.name === 'avatar'))) {
    throw new Error('Avatar column readback failed; do not deploy the API');
  }
  return 'applied';
}

function wrangler(args) {
  try {
    return execFileSync('npx', ['--yes', 'wrangler@4.147.0', 'd1', 'execute', 'reysonai', '--remote', '--config', 'wrangler.jsonc', '--yes', ...args],
      { cwd: backend, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 });
  } catch {
    throw new Error('D1 avatar schema command failed; deployment stopped');
  }
}

function remoteColumns() {
  const output = JSON.parse(wrangler(['--command', 'PRAGMA table_info(human_rank_players)', '--json']));
  if (!Array.isArray(output) || output.length !== 1 || output[0].success !== true || !Array.isArray(output[0].results)) {
    throw new Error('Unexpected D1 schema-read response; deployment stopped');
  }
  return output[0].results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await ensureHumanAvatarSchema({ columns: remoteColumns, apply: () => { wrangler(['--file', migration]); } });
    console.log(`Human avatar schema ${result}; verified by D1 readback.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Avatar schema deployment failed');
    process.exitCode = 1;
  }
}
