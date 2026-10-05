import game from "../../../configs/cash-6max-100bb.json" with { type: "json" };
import stage2 from "../../../configs/multiway-preflop-stage2.json" with { type: "json" };
import pilot from "../../frontend/scripts/data/postflop-ai-pilot.json" with { type: "json" };
import { referencePolicyFor } from "../../frontend/scripts/postflop-ai/policy.ts";
import { referenceLaterPolicy } from "../../frontend/scripts/postflop-ai/later-policy.ts";

export const POSTFLOP_RUNTIME_CONFIG_PATH = "/v1/postflop/runtime-config";

// Only the existing public browser configuration and comparator tables are served.
// This is an immutable module value, never a request, account, saved hand range or
// strategy-generation result. Keep v1 byte-stable for hash-pinned native clients.
const BODY = JSON.stringify({
  schemaVersion: 1,
  kind: "ai_estimate_not_gto",
  modelVersion: "reysonai-postflop-runtime-v1",
  configs: { game, stage2, pilot },
  references: {
    flop: { oop_checks: referencePolicyFor("oop_checks"), oop_leads: referencePolicyFor("oop_leads") },
    later: referenceLaterPolicy(),
  },
});
const SHA256 = "26beae01badcf7010c43376b0b394e06868361813f88817cee7c5bfa7611ef0b";
const HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "ETag",
  "x-content-type-options": "nosniff",
});

function failure(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...HEADERS, "cache-control": "no-store", ...(status === 405 ? { allow: "GET" } : {}) },
  });
}

// Deliberately accepts no env/binding/cache argument. No query can select a file,
// user, spot, strategy or arbitrary configuration. OPTIONS is not an API method.
export async function routePostflopRuntimeConfig(request: Request, url: URL): Promise<Response> {
  if (request.method !== "GET") return failure(405, "method_not_allowed");
  const params = [...url.searchParams];
  if (params.length !== 1 || params[0][0] !== "version" || params[0][1] !== "1") {
    return failure(400, "unsupported_runtime_config_version");
  }

  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(BODY));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    // Source/config drift must fail closed rather than silently changing model v1.
    if (hash !== SHA256) return failure(503, "runtime_config_unavailable");
    const etag = `"${hash}"`;
    const headers = { ...HEADERS, etag, "cache-control": "public, max-age=300, s-maxage=3600, must-revalidate" };
    const matches = (request.headers.get("if-none-match") ?? "").split(",").some(value => {
      const tag = value.trim();
      return tag === "*" || tag === etag || tag === `W/${etag}`;
    });
    return new Response(matches ? null : BODY, { status: matches ? 304 : 200, headers });
  } catch {
    return failure(503, "runtime_config_unavailable");
  }
}
