import { getReadClient } from "@/lib/supabase";

// 데모 데이터 (DB 미연결 시)
function demoSignals() {
  const stocks = [
    { code: "000660", name: "SK하이닉스", sector: "반도체" },
    { code: "005930", name: "삼성전자", sector: "반도체" },
    { code: "051910", name: "LG화학", sector: "화학" },
    { code: "006400", name: "삼성SDI", sector: "배터리" },
    { code: "035420", name: "NAVER", sector: "IT" },
    { code: "005380", name: "현대차", sector: "자동차" },
    { code: "068270", name: "셀트리온", sector: "바이오" },
    { code: "105560", name: "KB금융", sector: "금융" },
    { code: "373220", name: "LG에너지솔루션", sector: "배터리" },
    { code: "000270", name: "기아", sector: "자동차" },
    { code: "009150", name: "삼성전기", sector: "반도체" },
    { code: "066570", name: "LG전자", sector: "가전" },
    { code: "003670", name: "포스코퓨처엠", sector: "소재" },
    { code: "055550", name: "신한지주", sector: "금융" },
    { code: "034730", name: "SK", sector: "지주" },
    { code: "028260", name: "삼성물산", sector: "건설" },
    { code: "247540", name: "에코프로비엠", sector: "배터리" },
    { code: "207940", name: "삼성바이오로직스", sector: "바이오" },
    { code: "005490", name: "POSCO홀딩스", sector: "소재" },
    { code: "030200", name: "KT", sector: "통신" },
  ];
  return stocks.map((s, i) => {
    const prob = Math.round(87 - i * 3.5 + (Math.random() - 0.5) * 6);
    const price = Math.round(50000 + Math.random() * 350000);
    const chg = +(Math.random() * 7 - 1.5).toFixed(2);
    const volRatio = (1.5 + Math.random() * 3).toFixed(1);
    const reasons = ["거래량 급증 + 강한 상승세", "상승 전환 + 거래량 증가", "거래량 급증", "강한 상승세", "모니터링 대상", "거래량 증가"];
    return {
      ...s, price, chg, volume: Math.floor(Math.random() * 8e6 + 1e6),
      volRatio, quickScore: Math.round(60 + Math.random() * 30),
      probability: Math.min(Math.max(prob, 35), 95),
      reason: reasons[i % reasons.length], needsDetail: true,
    };
  }).sort((a, b) => b.probability - a.probability);
}

export async function GET() {
  // Supabase 연결 확인
  const db = getReadClient();
  if (!db.isReady()) {
    return Response.json({ mode: "demo", signals: demoSignals() });
  }

  try {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = `${kst.getFullYear()}-${String(kst.getMonth()+1).padStart(2,"0")}-${String(kst.getDate()).padStart(2,"0")}`;

    // 오늘 시그널
    let signals = await db.query("signals", {
      select: "*, stocks(name, sector)",
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
          select: "*, stocks(name, sector)",
          filters: { signal_date: `eq.${recent[0].signal_date}` },
          order: "probability.desc",
          limit: 30,
        });
      }
    }

    // DB에 데이터 없으면 데모
    if (!signals || signals.length === 0) {
      return Response.json({ mode: "demo", signals: demoSignals(), message: "DB에 데이터가 없어서 데모로 표시해요. /api/collect을 실행해 주세요." });
    }

    const formatted = signals.map(s => ({
      code: s.stock_code,
      name: s.stocks?.name || s.stock_code,
      sector: s.stocks?.sector || "—",
      price: s.current_price,
      chg: parseFloat(s.change_pct) || 0,
      volume: s.volume,
      volRatio: s.vol_ratio?.toFixed(1) || "1.0",
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
      volZRaw: s.vol_z_raw?.toString() || "1.0",
      needsDetail: true,
    }));

    return Response.json({ mode: "db", signals: formatted, date: signals[0]?.signal_date });
  } catch (err) {
    // DB 에러 시 데모로 폴백
    return Response.json({ mode: "demo", signals: demoSignals(), error: err.message });
  }
}
