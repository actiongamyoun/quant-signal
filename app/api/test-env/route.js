export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "(없음)";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "(없음)";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "(없음)";
  const kisKey = process.env.KIS_APP_KEY || "(없음)";
  const cron = process.env.CRON_SECRET || "(없음)";

  // DB 연결 테스트
  let dbTest = "not tested";
  if (url !== "(없음)" && anon !== "(없음)" && url.startsWith("https://")) {
    try {
      const res = await fetch(`${url}/rest/v1/stocks?select=code&limit=1`, {
        headers: {
          apikey: anon,
          Authorization: `Bearer ${anon}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      dbTest = res.ok ? `OK - ${Array.isArray(data) ? data.length : 0} rows` : `FAIL - ${res.status}`;
    } catch (e) {
      dbTest = `ERROR - ${e.message}`;
    }
  }

  return Response.json({
    supabase: {
      url: url.startsWith("https://") ? url : `INVALID: ${url.substring(0, 30)}...`,
      anon_key: anon.length > 20 ? `${anon.substring(0, 10)}...${anon.substring(anon.length - 6)} (${anon.length}자)` : anon,
      service_key: service.length > 20 ? `${service.substring(0, 10)}...${service.substring(service.length - 6)} (${service.length}자)` : service,
      db_test: dbTest,
    },
    kis: {
      key: kisKey.length > 8 ? `${kisKey.substring(0, 4)}****` : kisKey,
    },
    cron: cron !== "(없음)" ? "설정됨" : "(없음)",
  });
}
