export function isRetiredJapanesePath(pathname) {
  let path;
  try { path = decodeURIComponent(pathname).toLowerCase(); }
  catch { return false; }
  return path === "/ja" || path.startsWith("/ja/");
}

export function isRetiredAdminPath(pathname) {
  let path;
  try { path = decodeURIComponent(pathname).toLowerCase(); }
  catch { return false; }
  return path === "/admin" || path.startsWith("/admin/");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.reysonai.com") {
      url.hostname = "reysonai.com";
      return Response.redirect(url.toString(), 301);
    }
    if (isRetiredJapanesePath(url.pathname) || isRetiredAdminPath(url.pathname)) {
      return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    }
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
