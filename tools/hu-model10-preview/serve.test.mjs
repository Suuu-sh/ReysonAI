import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { startPreviewServer } from './serve.mjs';

const expectedBytes = 4154542;
const expectedSha256 = 'b7f2c572e636af5319a5326341d522b8905f0d355937168d6e8c1a2e043060fe';
let server;
let port;

before(async () => {
  server = await startPreviewServer(0);
  port = server.address().port;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

function getResponse(method, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, method, path }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('server binds only to IPv4 loopback', () => {
  assert.equal(server.address().address, '127.0.0.1');
  assert.equal(server.address().family, 'IPv4');
});

test('GET serves the exact saved HTML bytes without caching', async () => {
  const response = await getResponse('GET', '/dev/hu-model10/');
  const savedHtml = readFileSync(new URL('./preview.html', import.meta.url));
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['content-length'], String(expectedBytes));
  assert.equal(response.body.length, expectedBytes);
  assert.deepEqual(response.body, savedHtml);
  assert.equal(createHash('sha256').update(response.body).digest('hex'), expectedSha256);
});

test('HEAD returns the saved HTML headers without a body', async () => {
  const response = await getResponse('HEAD', '/dev/hu-model10/');
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-length'], String(expectedBytes));
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.length, 0);
});

test('GET and HEAD at the root redirect to the dedicated preview path', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = await getResponse(method, '/');
    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/dev/hu-model10/');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body.length, 0);
  }
});

test('unrelated files, directories and traversal paths are unavailable', async () => {
  for (const path of [
    '/preview.html', '/serve.mjs', '/README.md', '/dev/', '/dev/hu-model10',
    '/dev/hu-model10/preview.html', '/dev/hu-model10/?query=1',
    '/dev/hu-model10/../preview.html', '/dev/hu-model10/%2e%2e/preview.html',
    '//dev/hu-model10/', '/favicon.ico',
  ]) {
    const response = await getResponse('GET', path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers['cache-control'], 'no-store', path);
    assert.equal(response.body.length, 0, path);
  }
});

test('methods other than GET and HEAD are rejected', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE']) {
    for (const path of ['/', '/dev/hu-model10/', '/unavailable']) {
      const response = await getResponse(method, path);
      assert.equal(response.status, 405, `${method} ${path}`);
      assert.equal(response.headers.allow, 'GET, HEAD');
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.body.length, 0);
    }
  }
});

test('command rejects invalid PORT and command-line overrides', () => {
  const script = fileURLToPath(new URL('./serve.mjs', import.meta.url));
  for (const value of ['0', '-1', '65536', '5173x', '']) {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, PORT: value }, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 1, value);
    assert.match(result.stderr, /PORT must be an integer between 1 and 65535/);
  }
  const result = spawnSync(process.execPath, [script, '--host', '0.0.0.0'], {
    encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /configure PORT only/);
});
