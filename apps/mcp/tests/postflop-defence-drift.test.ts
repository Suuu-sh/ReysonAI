import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourcePath = "apps/frontend/scripts/postflop-ai/defence.ts";
const adapterPath = "apps/mcp/src/postflop-defence.mts";
const sourceSha256 = "309405b0f7ce4afc649095dbd9347561a590656eb1c7f577f8f177e352265cbe";
const adapterSha256 = "e76d6de37aca8923b02db4ad51a9e8e6b987cb8f7a85591ddbc16a385b352ccd";
const importedSourceSha256: any = {
  "apps/frontend/scripts/postflop-ai/types.ts": "d30d1fb50ad2ec0095fd040e05074d75b0c40cf5b48e013cc182aeee057f18ea",
  "apps/frontend/scripts/postflop-ai/later-tree.ts": "3a8d5a876823891e72b926a47fa35bef32a0516279a55de87d9b309954a389d7",
  "apps/frontend/scripts/postflop-ai/tree.ts": "c6d9cc1dba8fc5a13ee7539b9e109fc3996ffd7bcfeb1afdfa455b702dd65274",
  "apps/frontend/scripts/postflop-ai/engine.ts": "87504f81103d6f41a63bd0d3a4447b6ae4ad9e89f5f975795cc1d9ed2841daf4",
  "apps/frontend/scripts/postflop-ai/cached-values.ts": "329995771ce7b439ebdc1cf82fe0fa12e01302a94afd500e9c9bfa28cad0db88",
  "apps/frontend/scripts/postflop-ai/range-equity.ts": "687ec196e79fec883024b3e39a2cdaf6090afe25a5b3bccafb57c29f4fafd929",
  "apps/frontend/scripts/lib/equity.ts": "06cc2c30c1b9666c4263546039efb28feb4c2005eb2582644eb41a2c9da80363",
  "apps/frontend/scripts/postflop-ai/browser-inputs.ts": "37b9efef760033a3380a306c1769f8b2fe8d5bf2efb7d9b1965cace961cab60b",
  "apps/frontend/scripts/postflop-ai/model.ts": "fcbf13b6f8b1c3f72b8a81dcc626de89abc4c385d840163feb4bd78ca631732f",
  "apps/frontend/scripts/postflop-ai/hu-hand-tier.ts": "ab830cfa6a3488e4dc9cbdc0f6aa3c9d0b7299b77c7458269404cd067c4d173b",
  "apps/frontend/scripts/postflop-ai/policy.ts": "f9cf0c4cac35520699fa427c7e46cb106c15667b8a2ea0b190002f1cf79507e9",
  "apps/frontend/scripts/postflop-ai/later-policy.ts": "2a1c7b06c56ca88eac3d4e0642f2f13fb15f29d7a75b238abc3b3b91f0da1c10",
  "apps/frontend/scripts/data/postflop-ai-pilot.json": "1db32997ae5bca50a8c55215013d0092b5ef051cd0827c53594645517e2c5491",
};

const digest = (bytes?: any): any => createHash("sha256").update(bytes).digest("hex");
const readSource = async (relativePath?: any): Promise<any> => {
  const file = path.join(root, relativePath);
  return { file, text: await readFile(file, "utf8") };
};

function importContract(file?: any, text?: any): any {
  return text.split("\n").filter((line?: any): any => line.startsWith("import ")).map((line?: any): any => {
    const match = line.match(/^import\s+(.+?)\s+from\s+["']([^"']+)["'](?:\s+with\s+\{.*\})?;?$/);
    assert.ok(match, `unrecognized pinned import in ${file}: ${line}`);
    const target = path.resolve(path.dirname(file), match[2]);
    return {
      target: path.relative(root, target).split(path.sep).join("/"),
      bindings: match[1],
    };
  });
}

test("the MCP defence fork pins main numerical logic, seeded runouts, imports and cache budget", async (): Promise<any> => {
  const source = await readSource(sourcePath);
  const adapter = await readSource(adapterPath);
  assert.equal(digest(source.text), sourceSha256, "the main defence.ts base changed; renew this adapter deliberately");
  assert.equal(digest(adapter.text), adapterSha256,
    "the static MCP fork changed; review its complete diff and renew its pin deliberately");

  const sourceImports = importContract(source.file, source.text);
  const adapterImports = importContract(adapter.file, adapter.text);
  assert.deepEqual(adapterImports, sourceImports, "imports must resolve to the same targets with the same bindings");
  const importedPaths = [...new Set(sourceImports.map((item?: any): any => item.target))].sort();
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

test("drift gate rejects mutations to formulas, hand classification, and the MCP fork copy", {
  skip: process.env.MCP_DEFENCE_DRIFT_FIXTURE === "1",
}, async (): Promise<any> => {
  const testPath = path.relative(root, fileURLToPath(import.meta.url)).split(path.sep).join("/");
  const copiedPaths = [...new Set([sourcePath, adapterPath, ...Object.keys(importedSourceSha256), testPath])];
  const mutations = [
    {
      name: "main defence formula",
      file: sourcePath,
      before: "const DEFENCE_FLOOR_MARGIN = 0.1;",
      after: "const DEFENCE_FLOOR_MARGIN = 0.11;",
      diagnostic: /the main defence\.ts base changed/,
    },
    {
      name: "hand-tier classification dependency",
      file: "apps/frontend/scripts/postflop-ai/hu-hand-tier.ts",
      before: 'if (category > 3) return "monster";',
      after: 'if (category > 2) return "monster";',
      diagnostic: /hu-hand-tier\.ts changed/,
    },
    {
      name: "unexpected MCP fork formula difference",
      file: adapterPath,
      before: "const LOGISTIC_SCALE = 0.02;",
      after: "const LOGISTIC_SCALE = 0.03;",
      diagnostic: /the static MCP fork changed/,
    },
  ];

  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "mcp-postflop-defence-drift-"));
  try {
    const originals = new Map();
    for (const relativePath of copiedPaths) {
      const sourceFile = path.join(root, relativePath);
      const targetFile = path.join(fixtureRoot, relativePath);
      await mkdir(path.dirname(targetFile), { recursive: true });
      const original = await readFile(sourceFile);
      originals.set(relativePath, original);
      await copyFile(sourceFile, targetFile);
    }

    for (const mutation of mutations) {
      const targetFile = path.join(fixtureRoot, mutation.file);
      const original = originals.get(mutation.file).toString("utf8");
      assert.equal(original.split(mutation.before).length - 1, 1,
        `${mutation.name} fixture must match one exact expression`);
      await writeFile(targetFile, original.replace(mutation.before, mutation.after));

      const copiedTest = path.join(fixtureRoot, testPath);
      const result = spawnSync((process.execPath as any), ["--test", copiedTest], {
        cwd: fixtureRoot,
        env: { MCP_DEFENCE_DRIFT_FIXTURE: "1" } as unknown as NodeJS.ProcessEnv,
        encoding: "utf8",
        timeout: 10_000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 1,
        `${mutation.name} unexpectedly passed the copied drift gate\n${result.stdout}\n${result.stderr}`);
      assert.match(`${result.stdout}\n${result.stderr}`, mutation.diagnostic,
        `${mutation.name} was rejected for the expected pinned source/fork mismatch`);

      await writeFile(targetFile, originals.get(mutation.file));
    }

    for (const [relativePath, original] of originals) {
      assert.deepEqual(await readFile(path.join(root, relativePath)), original,
        `${relativePath} in the real worktree must remain untouched`);
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
