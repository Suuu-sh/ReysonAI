// Saved evidence can be read as text or bytes; JSON parsing preserves its recorded shape.
const parseEvidenceJson = (value: string | Uint8Array): any => JSON.parse(typeof value === "string" ? value : Buffer.from(value).toString("utf8"));
const {build} = await import(new URL('../pr50-qa/apps/frontend/node_modules/esbuild/lib/main.js', import.meta.url).href);
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const source=new URL('../pr50-qa/',import.meta.url).pathname,root=new URL('./',import.meta.url).pathname;
const hash=(b: any)=>createHash('sha256').update(b).digest('hex');
const hook=parseEvidenceJson(readFileSync(new URL('../pr44-fixture-final/provenance/executed-local-mocks.json',import.meta.url))).AuthPanel;
const result=await build({entryPoints:[root+'entry.tsx'],outfile:root+'qa.js',nodePaths:[source+'apps/frontend/node_modules'],bundle:true,platform:'browser',format:'esm',jsx:'automatic',target:'es2022',define:{'import.meta.env.VITE_API_BASE':'""'},loader:{'.png':'dataurl','.webp':'dataurl','.woff2':'dataurl'},metafile:true,plugins:[{name:'original-account-fixture-only',setup(b){b.onLoad({filter:/\/account\/AuthPanel\.tsx$/},()=>({contents:hook.executedContents,loader:'tsx'}));}}]});
const files=Object.keys(result.metafile.inputs).filter(p=>!p.includes('node_modules')).map(p=>{const b=readFileSync(p);return {path:p,bytes:b.length,sha256:hash(b)}});
writeFileSync(root+'build-evidence.json',JSON.stringify({sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),sourceTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:source,encoding:'utf8'}).trim(),hook,entry:'actual RangeWorkspace default route; original PR44 component fixture boundary; no policy/reader overrides',files},null,2));
