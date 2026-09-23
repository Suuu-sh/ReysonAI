import { spawn } from 'node:child_process';
import { startServer } from './local-estimate.mjs';
const server = startServer();
console.log('Local Codex estimate bridge: http://127.0.0.1:4318');
const vite = spawn('npm', ['run', 'dev'], { stdio: 'inherit' });
function stop() { vite.kill(); server.close(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
vite.on('exit', code => { server.close(); process.exitCode = code ?? 0; });
