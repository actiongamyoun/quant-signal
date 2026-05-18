export async function GET() {
  const key = process.env.KIS_APP_KEY || "(없음)";
  const secret = process.env.KIS_APP_SECRET || "(없음)";
  const base = process.env.KIS_API_BASE || "https://openapi.koreainvestment.com:9443";

  // 키 일부만 표시 (보안)
  const keyPreview = key.length > 8 ? key.substring(0, 4) + "****" + key.substring(key.length - 4) : key;
  const secretPreview = secret.length > 8 ? secret.substring(0, 4) + "****" + secret.substring(secret.length - 4) : secret;

  try {
    const res = await fetch(`${base}/oauth2/tokenP`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: key,
        appsecret: secret,
      }),
    });

    const data = await res.json();

    return Response.json({
      status: data.access_token ? "SUCCESS" : "FAIL",
      token_preview: data.access_token ? data.access_token.substring(0, 20) + "..." : null,
      kis_response: data,
      env_check: {
        KIS_APP_KEY: keyPreview,
        KIS_APP_SECRET: secretPreview,
        KIS_API_BASE: base,
        key_length: key.length,
        secret_length: secret.length,
      },
    });
  } catch (err) {
    return Response.json({
      status: "ERROR",
      error: err.message,
      env_check: {
        KIS_APP_KEY: keyPreview,
        KIS_APP_SECRET: secretPreview,
        KIS_API_BASE: base,
      },
    });
  }
}
