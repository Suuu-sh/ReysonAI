import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { accountApiBase } from "../src/account/config.ts";
test("development authentication defaults to local Google API and never falls back to production", () => {
  assert.equal(accountApiBase({ DEV: true }), "http://localhost:8787");
  assert.equal(accountApiBase({ DEV: true, VITE_API_BASE: "http://127.0.0.1:8787/" }), "http://127.0.0.1:8787");
  for (const value of ["https://api.reysonai.com", "http://localhost.evil.example:8787", "http://192.168.1.10:8787", "http://user:pass@localhost:8787", "http://localhost:8787/other"]) {
    assert.throws(() => accountApiBase({ DEV: true, VITE_API_BASE: value }), /loopback/);
  }
});
test("production cannot select local API or enable a fake auth fixture", async () => {
  assert.equal(accountApiBase({ DEV: false, VITE_API_BASE: "http://localhost:8787", VITE_DEV_AUTH_SKIP: "true" }), "https://api.reysonai.com");
  assert.equal(accountApiBase({ VITE_DEV_AUTH_SKIP: "true" }), "https://api.reysonai.com");
  const session = await readFile(new URL("../src/account/session.ts", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/ProductApp.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(session + app, /VITE_DEV_AUTH_SKIP|dev-fixture|fake-user/);
});
test("development startup uses only local config/schema and cleans both processes", async () => {
  const script = await readFile(new URL("../scripts/dev-account.mjs", import.meta.url), "utf8");
  assert.match(script, /wrangler\.local\.jsonc/);
  assert.match(script, /"d1", "execute", "reysonai-local", "--local"/);
  assert.match(script, /0007_accounts\.sql/);
  assert.match(script, /"dev", "--local"/);
  assert.match(script, /--strictPort/);
  assert.match(script, /process\.once\("SIGINT", stop\)/);
  assert.doesNotMatch(script, /--remote|wrangler\.jsonc|\.dev\.vars.*readFile|GOOGLE_CLIENT_SECRET/);
});
