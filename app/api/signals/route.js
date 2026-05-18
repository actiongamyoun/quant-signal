import { getReadClient } from "@/lib/supabase";

function demoSignals() {
  const stocks = [
    { code: "000660", name: "SK하이닉스", sector: "반도체", price: 1648000, chg: -0.36 },
    { code: "005930", name: "삼성전자", sector: "반도체", price: 271500, chg: 2.07 },
    { code: "051910", name: "LG화학", sector: "화학" },
    { code: "006400", name: "삼성SDI", sector: "배터리" },
    { code: "035420", name: "NAVER", sector: "IT" },
    { code: "005380", name: "현대차", sector: "자동차" },
    { code: "068270", name: "셀트리온", sector: "바이오" },
    { code: "105560", name: "KB금융", sector: "금융" },
    { code: "373220", name: "LG에너지솔루션", sector: "배터리" },
    { code: "000270", name: "기아", sector: "자동차" },
  ];
  return stocks.map((s, i) => {
    const prob = Math.round(87 - i * 3.5 + (Math.random() - 0.5) * 6);
    const price = s.price || Math.round(50000 + Math.random() * 350000);
    const chg = s.chg !== undefined ? s.chg : +(Math.random() * 7 - 1.5).toFixed(2);
    const reasons = ["거래량 급증 + 강한 상승세", "상승 전환 + 거래량 증가", "거래량 급증", "강한 상승세", "모니터링 대상", "거래량 증가"];
    return {
      code: s.code, name: s.name, sector: s.sector, price, chg,
      volume: Math.floor(Math.random() * 8e6 + 1e6),
      volRatio: (1.5 + Math.random() * 3).toFixed(1),
      quickScore: Math.round(60 + Math.random() * 30),
      probability: Math.min(Math.max(prob, 35), 95),
      reason: reasons[i % reasons.length], needsDetail: true,
    };
  }).sort((a, b) => b.probability - a.probability);
}

export async function GET() {
  let db;
  try {
    db = getReadClient();
  } catch {
    return Response.json({ mode: "demo", signals: demoSignals() });
  }

  if (!db.isReady()) {
    return Response.json({ mode: "demo", signals: demoSignals() });
  }

  try {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = `${kst.getFullYear()}-${String(kst.getMonth()+1).padStart(2,"0")}-${String(kst.getDate()).padStart(2,"0")}`;

    // 오늘 시그널 조회
    let signals = await db.query("signals", {
      filters: { signal_date: `eq.${today}` },
      order: "probability.desc",
      limit: 30,
    });

    // 오늘 없으면 최근 날짜
    if (!signals || signals.length === 0) {
      const recent = await db.query("signals", {
        select: "signal_date",
        order: "signal_date.desc",
        limit: 1,
      });
      if (recent && recent.length > 0) {
        signals = await db.query("signals", {
          filters: { signal_date: `eq.${recent[0].signal_date}` },
          order: "probability.desc",
          limit: 30,
        });
      }
    }

    if (!signals || signals.length === 0) {
      return Response.json({ mode: "demo", signals: demoSignals(), message: "DB에 시그널이 없어요" });
    }

    // 종목명 조회
    const codes = [...new Set(signals.map(s => s.stock_code))];
    let stockMap = {};
    try {
      const stocks = await db.query("stocks", {
        select: "code,name,sector",
        filters: { code: `in.(${codes.join(",")})` },
      });
      if (stocks && Array.isArray(stocks)) {
        stocks.forEach(s => { stockMap[s.code] = s; });
      }
    } catch {}

    const formatted = signals.map(s => ({
      code: s.stock_code,
      name: stockMap[s.stock_code]?.name || s.stock_code,
      sector: stockMap[s.stock_code]?.sector || "—",
      price: s.current_price,
      chg: parseFloat(s.change_pct) || 0,
      volume: s.volume,
      volRatio: s.vol_ratio ? parseFloat(s.vol_ratio).toFixed(1) : "1.0",
      quickScore: s.score,
      probability: s.probability,
      reason: s.reason || "시그널 감지",
      features: {
        breakout: s.feat_breakout,
        volumeZ: s.feat_volume_z,
        trend: s.feat_trend,
        volContraction: s.feat_vol_contraction,
        sectorRS: s.feat_sector_rs,
      },
      volZRaw: s.vol_z_raw ? s.vol_z_raw.toString() : "1.0",
      needsDetail: true,
    }));

    return Response.json({
      mode: "live",
      signals: formatted,
      date: signals[0]?.signal_date,
      count: formatted.length,
    });
  } catch (err) {
    return Response.json({ mode: "demo", signals: demoSignals(), error: err.message });
  }
}
