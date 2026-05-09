export async function POST(request) {
  try {
    const { endpoint, method = "GET", trId, params, token, appKey, appSecret, apiBase } = await request.json();
    const key = appKey || process.env.KIS_APP_KEY;
    const secret = appSecret || process.env.KIS_APP_SECRET;
    const base = apiBase || process.env.KIS_API_BASE || "https://openapi.koreainvestment.com:9443";
    if (!endpoint || !token) return Response.json({ error: "endpoint, token 필요" }, { status: 400 });

    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`, appkey: key, appsecret: secret, tr_id: trId || "",
    };
    let url = `${base}${endpoint}`;
    const opts = { headers };
    if (method === "GET" && params) { url += "?" + new URLSearchParams(params).toString(); opts.method = "GET"; }
    else if (method === "POST") { opts.method = "POST"; opts.body = JSON.stringify(params || {}); }
    else { opts.method = "GET"; if (params) url += "?" + new URLSearchParams(params).toString(); }

    const res = await fetch(url, opts);
    return Response.json(await res.json());
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
