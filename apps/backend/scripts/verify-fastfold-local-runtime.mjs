// Use an already-installed locked official Wrangler runtime. No install, credentials,
// remote storage or runtime guessing here; CI supplies Wrangler via its existing npx pin.
import { realpathSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const option=process.argv.indexOf('--wrangler');
if(option<0||!process.argv[option+1])throw Error('Supply --wrangler /path/to/existing/official/wrangler');
const wrangler=realpathSync(process.argv[option+1]);
const root=resolve(dirname(wrangler),'..');
const manifest=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
if(manifest.name!=='wrangler'||manifest.version!=='4.147.0')throw Error('Only the reviewed official Wrangler4.147.0 runtime is accepted');
const require=createRequire(wrangler),runtime=require.resolve('miniflare');
const result=spawnSync(process.execPath,['--experimental-strip-types','--test','tests/fastfold.test.mjs','tests/fastfold-release.test.mjs','tests/fastfold-do.test.mjs'],{
 cwd:new URL('..',import.meta.url),stdio:'inherit',env:{...process.env,WORKERD_MODULE:runtime,WRANGLER_SEND_METRICS:'false'},
});
if(result.error)throw result.error;process.exit(result.status??1);
