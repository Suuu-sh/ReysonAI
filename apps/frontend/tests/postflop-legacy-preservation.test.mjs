import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("legacy preservation rejects corrupt bytes and preserves exact historical source",()=>{
  const code = `import importlib.util, pathlib, tempfile, json\nfrom unittest.mock import patch\np=pathlib.Path('scripts/postflop-ai/preserve-legacy-postflop.py').resolve()\ns=importlib.util.spec_from_file_location('legacy',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)\ntry: m.inspect_archive(b'changed')\nexcept ValueError: pass\nelse: raise AssertionError('corrupt archive accepted')\nmanifest=m.preserve(verify=True)\nassert len(manifest['spots'])==45 and len(manifest['files'])==135\nassert manifest['report_defence_version']==5\nassert manifest['status']=='historical-not-current-audit-approval'\nwith tempfile.TemporaryDirectory() as d:\n root=pathlib.Path(d); (root/'artifacts/postflop').mkdir(parents=True)\n (root/m.ARCHIVE).write_bytes(b'original')\n with patch.object(m,'ROOT',root), patch.object(m,'inspect_archive',return_value=manifest):\n  source=root/'source.zip'; source.write_bytes(b'different')\n  try: m.preserve(source)\n  except ValueError: pass\n  else: raise AssertionError('different archive overwritten')\n assert (root/m.ARCHIVE).read_bytes()==b'original'\n`;
  const result=spawnSync("python3",["-B","-c",code],{cwd:fileURLToPath(new URL("..",import.meta.url)),encoding:"utf8"});
  assert.equal(result.status,0,result.stderr||result.stdout);
});
