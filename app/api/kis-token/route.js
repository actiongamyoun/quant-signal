export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const key = body.appKey || process.env.KIS_APP_KEY;
    const secret = body.appSecret || process.env.KIS_APP_SECRET;
    const base = body.apiBase || process.env.KIS_API_BASE || "https://openapi.koreainvestment.com:9443";
    if (!key || !secret) return Response.json({ error: "APP KEY/SECRET 필요" }, { status: 400 });

    const res = await fetch(`${base}/oauth2/tokenP`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", appkey: key, appsecret: secret }),
    });
    return Response.json(await res.json());
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
