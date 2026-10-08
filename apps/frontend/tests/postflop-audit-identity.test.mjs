import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { captureAuditIdentity, identityHash } from "../scripts/postflop-ai/audit-identity.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "hu-audit-identity-"));
  const write = (path, value) => { mkdirSync(dirname(join(root,path)),{recursive:true}); writeFileSync(join(root,path),value); };
  const p = "apps/frontend/scripts/postflop-ai/";
  write(p+"cli.mjs", 'import "./cached-values.mjs"; export { x } from "./browser-inputs.mjs";\n');
  write(p+"cached-values.mjs", "export const x=1;\n");
  write(p+"browser-inputs.mjs", 'import "../../src/estimated/sizing.ts"; export const x=1;\n');
  write("apps/frontend/src/estimated/sizing.ts", 'import config from "../../../../configs/game.json" with {type:"json"};\n');
  write("configs/game.json", '{"stack":100}\n');
  write(p+"board-worker.mjs", 'const x = import("./worker-numeric.mjs");\n');
  write(p+"worker-numeric.mjs", 'export const x=2;\n');
  for (const name of ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "limp-responses", "limp-deep-responses", "multiway-responses", "multiway2-responses", "squeeze-responses", "cold-three-bet-responses", "cold-four-bet-responses", "continuation-responses"])
    write(`apps/frontend/src/estimated/${name}.json`, '{}\n');
  return { root, write, p };
}

test("audit identity binds transitive cache/browser/sizing/config/worker sources and raw inputs", () => {
  const {root,write,p}=fixture();
  try {
    const before=captureAuditIdentity({root});
    assert.deepEqual(before,captureAuditIdentity({root}));
    for(const path of [p+"cached-values.mjs",p+"browser-inputs.mjs",p+"worker-numeric.mjs","apps/frontend/src/estimated/sizing.ts","configs/game.json"])
      assert.ok(before.sources.some(row=>row.path===path),path);
    assert.equal(before.inputs.length,12);
    write(p+"cached-values.mjs","export const x=3;\n");
    assert.notEqual(identityHash(before),identityHash(captureAuditIdentity({root})));
    const changed=captureAuditIdentity({root});
    write("apps/frontend/src/estimated/continuation-responses.json",'{"changed":true}\n');
    assert.notEqual(identityHash(changed),identityHash(captureAuditIdentity({root})));
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("audit identity rejects escaped and symlink dependencies",()=>{
  const {root,write,p}=fixture();
  try {
    write(p+"cli.mjs",'import "../../../../../../escape.mjs";\n');
    assert.throws(()=>captureAuditIdentity({root}),/Invalid audit source path/);
    write(p+"cli.mjs",'import "./alias.mjs";\n');
    symlinkSync(join(root,p,"cached-values.mjs"),join(root,p,"alias.mjs"));
    assert.throws(()=>captureAuditIdentity({root}),/symlink/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
