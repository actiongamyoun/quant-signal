// ═══════════════════════════════════════════════════════════
// 시그널 목록 API (DB에서 읽기)
// Supabase에서 오늘 시그널 조회 → 즉시 응답
// ═══════════════════════════════════════════════════════════

import { getReadClient } from "@/lib/supabase";

export async function GET() {
  const db = getReadClient();

  try {
    // 오늘 날짜 (한국시간 기준)
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = `${kst.getFullYear()}-${String(kst.getMonth()+1).padStart(2,"0")}-${String(kst.getDate()).padStart(2,"0")}`;

    // 오늘 시그널 조회
    let signals = await db.query("signals", {
      select: "*, stocks!inner(name, sector)",
      filters: { signal_date: `eq.${today}` },
      order: "probability.desc",
      limit: 30,
    });

    // 오늘 데이터 없으면 가장 최근 데이터 조회
    if (!signals || signals.length === 0 || signals.error) {
      // 최근 시그널 날짜 찾기
      const recent = await db.query("signals", {
        select: "signal_date",
        order: "signal_date.desc",
        limit: 1,
      });

      if (recent && recent.length > 0) {
        const latestDate = recent[0].signal_date;
        signals = await db.query("signals", {
          select: "*, stocks!inner(name, sector)",
          filters: { signal_date: `eq.${latestDate}` },
          order: "probability.desc",
          limit: 30,
        });
      }
    }

    // 데이터가 아예 없으면 (최초 상태)
    if (!signals || signals.length === 0 || signals.error) {
      return Response.json({
        mode: "empty",
        signals: [],
        message: "아직 수집된 데이터가 없어요. 수집을 먼저 실행하세요.",
      });
    }

    // 응답 포맷 변환
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

    return Response.json({
      mode: "db",
      signals: formatted,
      date: signals[0]?.signal_date,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json({ mode: "error", signals: [], error: err.message }, { status: 500 });
  }
}
