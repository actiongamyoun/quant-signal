// ═══════════════════════════════════════════════════════════
// 종목 상세 분석 API (2단계)
// 사용자가 종목을 클릭했을 때만 호출
// → KIS API로 해당 종목 일봉 120일 수집 (API 2회)
// → 5개 피처 스코어링 + 차트 데이터 반환
// ═══════════════════════════════════════════════════════════

import { calculateScore } from "@/lib/scoring";

function formatDate(d) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

export async function POST(request) {
  const { code, name } = await request.json();
  const key = process.env.KIS_APP_KEY;
  const secret = process.env.KIS_APP_SECRET;
  const base = process.env.KIS_API_BASE || "https://openapi.koreainvestment.com:9443";

  // 데모 모드
  if (!key || !secret) {
    return Response.json({ mode: "demo", detail: generateDemoDetail(code, name) });
  }

  try {
    // 1. 토큰 발급
    const tokenRes = await fetch(`${base}/oauth2/tokenP`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", appkey: key, appsecret: secret }),
    });
    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;
    if (!token) return Response.json({ mode: "demo", detail: generateDemoDetail(code, name), error: "토큰 실패" });

    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: key, appsecret: secret,
    };

    // 2. 일봉 데이터 수집 (API 1회) - 최근 180일
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - 180);

    const dailyParams = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: formatDate(start),
      FID_INPUT_DATE_2: formatDate(end),
      FID_PERIOD_DIV_CODE: "D",
      FID_ORG_ADJ_PRC: "0",
    });

    const dailyRes = await fetch(
      `${base}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${dailyParams}`,
      { headers: { ...headers, tr_id: "FHKST03010100" } }
    );
    const dailyData = await dailyRes.json();
    const rawDaily = dailyData.output2 || [];

    if (rawDaily.length < 30) {
      return Response.json({ mode: "demo", detail: generateDemoDetail(code, name), error: "데이터 부족" });
    }

    // 3. 현재가 상세 조회 (API 1회)
    const priceParams = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: code,
    });
    const priceRes = await fetch(
      `${base}/uapi/domestic-stock/v1/quotations/inquire-price?${priceParams}`,
      { headers: { ...headers, tr_id: "FHKST01010100" } }
    );
    const priceData = await priceRes.json();
    const priceInfo = priceData.output || {};

    // 4. 데이터 정리 (최신순 → 오래된순)
    const sorted = [...rawDaily].reverse();
    const closes = sorted.map(d => parseInt(d.stck_clpr) || 0);
    const highs = sorted.map(d => parseInt(d.stck_hgpr) || 0);
    const lows = sorted.map(d => parseInt(d.stck_lwpr) || 0);
    const opens = sorted.map(d => parseInt(d.stck_oprc) || 0);
    const volumes = sorted.map(d => parseInt(d.acml_vol) || 0);
    const dates = sorted.map(d => {
      const ds = d.stck_bsop_date;
      return `${parseInt(ds.substring(4,6))}/${parseInt(ds.substring(6,8))}`;
    });

    // 5. 스코어링
    const scoreResult = calculateScore({ closes, highs, lows, volumes });

    // 6. 차트 데이터 구성
    const chartData = sorted.map((d, i) => ({
      date: dates[i],
      close: closes[i],
      open: opens[i],
      high: highs[i],
      low: lows[i],
      volume: volumes[i],
    }));

    // 7. 현재가 정보
    const currentPrice = parseInt(priceInfo.stck_prpr) || closes[closes.length - 1];
    const prevClose = parseInt(priceInfo.stck_sdpr) || closes[closes.length - 2];
    const changePercent = prevClose > 0 ? ((currentPrice - prevClose) / prevClose * 100).toFixed(2) : "0.00";

    return Response.json({
      mode: "live",
      detail: {
        code,
        name: name || priceInfo.stck_shrn_iscd || code,
        price: currentPrice,
        chg: parseFloat(changePercent),
        volume: volumes[volumes.length - 1],
        high52w: parseInt(priceInfo.stck_dryy_hgpr) || 0,
        low52w: parseInt(priceInfo.stck_dryy_lwpr) || 0,
        marketCap: priceInfo.hts_avls || "—",
        ...scoreResult,
        chartData,
      },
    });
  } catch (err) {
    return Response.json({ mode: "demo", detail: generateDemoDetail(code, name), error: err.message });
  }
}

// ─── 데모 상세 데이터 ──────────────────────────────────────
function generateDemoDetail(code, name) {
  const basePrice = 50000 + Math.random() * 300000;
  const chartData = [];
  let p = basePrice * 0.85;
  const now = new Date();

  for (let i = 119; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const o = p;
    const c = p * (1 + (Math.random() - 0.48) * 0.025);
    const h = Math.max(o, c) * (1 + Math.random() * 0.012);
    const l = Math.min(o, c) * (1 - Math.random() * 0.012);
    chartData.push({
      date: `${d.getMonth()+1}/${d.getDate()}`,
      open: Math.round(o), high: Math.round(h),
      low: Math.round(l), close: Math.round(c),
      volume: Math.floor(Math.random() * 5e6 + 5e5),
    });
    p = c;
  }

  const closes = chartData.map(d => d.close);
  const highs = chartData.map(d => d.high);
  const volumes = chartData.map(d => d.volume);

  // scoring.js의 calculateScore 대신 간이 계산
  const features = {
    breakout: Math.round(60 + Math.random() * 35),
    volumeZ: Math.round(40 + Math.random() * 50),
    trend: Math.round(50 + Math.random() * 45),
    volContraction: Math.round(45 + Math.random() * 50),
    sectorRS: Math.round(45 + Math.random() * 45),
  };

  const score = Math.round(
    features.breakout * 0.25 + features.volumeZ * 0.2 +
    features.trend * 0.25 + features.volContraction * 0.15 +
    features.sectorRS * 0.15
  );

  const x = (score - 50) / 20;
  const probability = Math.round((1 / (1 + Math.exp(-x))) * 100 * 0.9 + 5);

  const reasons = ["120일 고점 돌파 임박 + 거래량 급증", "강한 상승 추세 + 섹터 강세", "변동성 수축 후 돌파 예상", "거래량 급증 + 추세 전환"];

  return {
    code, name: name || code,
    price: Math.round(p),
    chg: +(Math.random() * 6 - 1).toFixed(2),
    volume: volumes[volumes.length - 1],
    score, probability, features,
    volZRaw: (1 + Math.random() * 3).toFixed(1),
    reason: reasons[Math.floor(Math.random() * reasons.length)],
    chartData,
  };
}
