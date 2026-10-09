import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourcePath = "apps/frontend/scripts/postflop-ai/defence.ts";
const adapterPath = "apps/mcp/src/postflop-defence.mts";
const sourceSha256 = "47aba428f9c798079411014d638b7d80c25efaf15d4770fb1f144b19c0462a1d";
const adapterSha256 = "e76d6de37aca8923b02db4ad51a9e8e6b987cb8f7a85591ddbc16a385b352ccd";
const importedSourceSha256 = {
  "apps/frontend/scripts/postflop-ai/types.ts": "fca9397238fdda34ae4848225cb85dd9fe5a8fefcf493a9c188ea18a761229b2",
  "apps/frontend/scripts/postflop-ai/later-tree.ts": "3a8d5a876823891e72b926a47fa35bef32a0516279a55de87d9b309954a389d7",
  "apps/frontend/scripts/postflop-ai/tree.ts": "c6d9cc1dba8fc5a13ee7539b9e109fc3996ffd7bcfeb1afdfa455b702dd65274",
  "apps/frontend/scripts/postflop-ai/engine.ts": "82af24b14a2f4c5b61283958e49fbc8b2414597d213f823c4d6656668b408e7c",
  "apps/frontend/scripts/postflop-ai/cached-values.ts": "329995771ce7b439ebdc1cf82fe0fa12e01302a94afd500e9c9bfa28cad0db88",
  "apps/frontend/scripts/postflop-ai/range-equity.ts": "edefbe502204e626f385ac3e9612a4d708da4b25768030f623fe81c6afdee909",
  "apps/frontend/scripts/lib/equity.ts": "f395860a9243f0dc450e51c6ddcc4fe700339a846198b5914ae65bf6a24906c3",
  "apps/frontend/scripts/postflop-ai/browser-inputs.ts": "9bd17ab71c5009af828aec9b4260bc8cdb89c7da1cc55334aeeec70276f3219d",
  "apps/frontend/scripts/postflop-ai/model.ts": "fcbf13b6f8b1c3f72b8a81dcc626de89abc4c385d840163feb4bd78ca631732f",
  "apps/frontend/scripts/postflop-ai/hu-hand-tier.ts": "ab830cfa6a3488e4dc9cbdc0f6aa3c9d0b7299b77c7458269404cd067c4d173b",
  "apps/frontend/scripts/postflop-ai/policy.ts": "7697491739c8dc9a73bc65110f6a6059272c0690886e41d0378b124e6e4c0d36",
  "apps/frontend/scripts/postflop-ai/later-policy.ts": "654bfd24a665f27c5c0d4a8e0aa97e9c7107ac064b97f6e5421235d02232fb33",
  "apps/frontend/scripts/data/postflop-ai-pilot.json": "1db32997ae5bca50a8c55215013d0092b5ef051cd0827c53594645517e2c5491",
};

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const readSource = async relativePath => {
  const file = path.join(root, relativePath);
  return { file, text: await readFile(file, "utf8") };
};

function importContract(file, text) {
  return text.split("\n").filter(line => line.startsWith("import ")).map(line => {
    const match = line.match(/^import\s+(.+?)\s+from\s+["']([^"']+)["'](?:\s+with\s+\{.*\})?;?$/);
    assert.ok(match, `unrecognized pinned import in ${file}: ${line}`);
    const target = path.resolve(path.dirname(file), match[2]);
    return {
      target: path.relative(root, target).split(path.sep).join("/"),
      bindings: match[1],
    };
  });
}

test("the MCP defence fork pins main numerical logic, seeded runouts, imports and cache budget", async () => {
  const source = await readSource(sourcePath);
  const adapter = await readSource(adapterPath);
  assert.equal(digest(source.text), sourceSha256, "the main defence.ts base changed; renew this adapter deliberately");
  assert.equal(digest(adapter.text), adapterSha256,
    "the static MCP fork changed; review its complete diff and renew its pin deliberately");

  const sourceImports = importContract(source.file, source.text);
  const adapterImports = importContract(adapter.file, adapter.text);
  assert.deepEqual(adapterImports, sourceImports, "imports must resolve to the same targets with the same bindings");
  const importedPaths = [...new Set(sourceImports.map(item => item.target))].sort();
  assert.deepEqual(importedPaths, Object.keys(importedSourceSha256).sort(), "the complete shared dependency set is pinned");
  for (const relativePath of importedPaths) {
    const { text } = await readSource(relativePath);
    assert.equal(digest(text), importedSourceSha256[relativePath],
      `${relativePath} changed; do not silently follow shared dependency drift`);
  }

  assert.match(source.text, /const TABLE_LIMIT = 3000;/);
  assert.match(adapter.text, /const TABLE_LIMIT = 600;/,
    "only the MCP rank-table cache budget differs from the shared source");
  assert.match(source.text, /const TIER_LIMIT = 3000;/);
  assert.match(adapter.text, /const TIER_LIMIT = 3000;/);
});
