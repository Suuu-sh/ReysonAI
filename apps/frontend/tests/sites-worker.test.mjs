import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import test from "node:test";
import worker, { isRetiredAdminPath, isRetiredJapanesePath } from "../worker/index.js";

test("retired Japanese paths return 404 before static assets or app fallback", async () => {
  assert.equal(isRetiredJapanesePath("/ja"), true);
  assert.equal(isRetiredJapanesePath("/ja/pricing"), true);
  assert.equal(isRetiredJapanesePath("/%6a%61"), true);
  assert.equal(isRetiredJapanesePath("/japan"), false);
  for (const path of ["/ja", "/ja/", "/ja/pricing", "/%6a%61"]) {
    let assetCalls = 0;
    const response = await worker.fetch(new Request(`https://example.test${path}`, { headers: { accept: "text/html" } }), {
      ASSETS: { fetch: async () => { assetCalls += 1; return new Response("site"); } },
    });
    assert.equal(response.status, 404);
    assert.equal(await response.text(), "Not Found");
    assert.equal(assetCalls, 0);
  }
});

test("retired Admin paths return 404 before static assets or app fallback", async () => {
  assert.equal(isRetiredAdminPath("/administrator"), false);
  for (const host of ["reysonai.com", "app.reysonai.com"]) {
    for (const path of ["/admin", "/admin/", "/admin/coverage", "/%61dmin", "/ADMIN"]) {
      assert.equal(isRetiredAdminPath(path), true);
      let assetCalls = 0;
      const response = await worker.fetch(new Request(`https://${host}${path}`, { headers: { accept: "text/html" } }), {
        ASSETS: { fetch: async () => { assetCalls += 1; return new Response("app"); } },
      });
      assert.equal(response.status, 404);
      assert.equal(await response.text(), "Not Found");
      assert.equal(assetCalls, 0);
    }
  }
});

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("app host serves the shared app shell at its root", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://app.reysonai.com/", {
    headers: { accept: "text/html" },
  }), {
    ASSETS: { fetch: async request => {
      calls.push(new URL(request.url).pathname);
      return new Response("shared app shell");
    } },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/"]);
  const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(config, /"pattern": "app\.reysonai\.com", "custom_domain": true/);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});
