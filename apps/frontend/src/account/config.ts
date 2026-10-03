// Development authentication stays on loopback. Production never uses dev URLs or bypasses.
export function accountApiBase(env: { DEV?: boolean; VITE_API_BASE?: string } = {}) {
  if (env.DEV !== true) return "https://api.reysonai.com";
  const url = new URL(env.VITE_API_BASE || "http://localhost:8787");
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Development authentication requires a loopback HTTP API.");
  }
  return url.origin;
}
