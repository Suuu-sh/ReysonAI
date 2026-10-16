import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("all tracked source, config, test and tooling files use TypeScript", () => {
  const paths = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0");
  const javascript = paths.filter(path => /\.(?:[cm]?js|jsx)$/.test(path) && existsSync(new URL(path, new URL("../../", import.meta.url))));
  assert.deepEqual(javascript, [], "Migrate new source files to TypeScript; generated JavaScript belongs in ignored build outputs");
});

test("application and runtime typechecks retain strict coverage", () => {
  for (const path of ["apps/frontend/tsconfig.json", "apps/frontend/tsconfig.runtime.json", "apps/frontend/tsconfig.scripts.json", "apps/mcp/tsconfig.json"]) {
    const config = JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
    assert.equal(config.compilerOptions.strict, true, path);
    assert.notEqual(config.compilerOptions.noCheck, true, path);
  }
});
