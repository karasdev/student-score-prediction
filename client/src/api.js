// Calls the API server. Its URL is set in /config.js (window.APP_CONFIG).
//   api("/students")                                   -> GET
//   api("/models/train", { method: "POST", body: {} }) -> POST with a JSON body
// Throws an Error with the server's message if the request fails.
export async function api(path, options) {
  const opts = options || {};
  const base = window.APP_CONFIG.API_URL;
  let res;
  try {
    res = await fetch(base + path, {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    throw new Error(`Can't reach the API at ${base} - is the server running?`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
