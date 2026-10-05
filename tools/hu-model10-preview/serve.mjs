import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const HOST = '127.0.0.1';
const PREVIEW_PATH = '/dev/hu-model10/';
const previewHtml = readFileSync(new URL('./preview.html', import.meta.url));

function configuredPort() {
  const value = process.env.PORT ?? '5173';
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return Number(value);
}

// Port 0 is useful for isolated tests; the command accepts only PORT=1..65535.
export function startPreviewServer(port = configuredPort()) {
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Length': '0' });
      response.end();
      return;
    }

    if (request.url === '/') {
      response.writeHead(302, { Location: PREVIEW_PATH, 'Content-Length': '0' });
      response.end();
      return;
    }

    // Exact matching also rejects traversal, encoded paths and other files.
    if (request.url !== PREVIEW_PATH) {
      response.writeHead(404, { 'Content-Length': '0' });
      response.end();
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': String(previewHtml.length),
    });
    response.end(request.method === 'HEAD' ? undefined : previewHtml);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) {
      throw new Error('Usage: node tools/hu-model10-preview/serve.mjs (configure PORT only).');
    }
    const server = await startPreviewServer();
    console.log(`Saved model10 preview: http://${HOST}:${server.address().port}${PREVIEW_PATH}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
