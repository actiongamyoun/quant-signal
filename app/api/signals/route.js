import { calculateScore, STOCK_POOL } from "@/lib/scoring";

// 날짜 헬퍼
function formatDate(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

// KIS API로 일봉 데이터 가져오기
async function fetchDailyChart(code, token, key, secret, base) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 180); // 6개월

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "J",
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: formatDate(start),
    FID_INPUT_DATE_2: formatDate(end),
    FID_PERIOD_DIV_CODE: "D",
    FID_ORG_ADJ_PRC: "0",
  });

  const res = await fetch(
    `${base}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`,
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        authorization: `Bearer ${token}`,
        appkey: key,
        appsecret: secret,
        tr_id: "FHKST03010100",
      },
    }
  );

  const data = await res.json();
  return data.output2 || [];
}

// KIS API 현재가 조회
async function fetchCurrentPrice(code, token, key, secret, base) {
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "J",
    FID_INPUT_ISCD: code,
  });

  const res = await fetch(
    `${base}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`,
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        authorization: `Bearer ${token}`,
        appkey: key,
        appsecret: secret,
        tr_id: "FHKST01010100",
      },
    }
  );

  const data = await res.json();
  return data.output || {};
}

export async function GET(request) {
  const key = process.env.KIS_APP_KEY;
  const secret = process.env.KIS_APP_SECRET;
  const base = process.env.KIS_API_BASE || "https://openapi.koreainvestment.com:9443";

  // 데모 모드 (API 키 없을 때)
  if (!key || !secret) {
    return Response.json({ mode: "demo", signals: generateDemoSignals() });
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
    if (!token) return Response.json({ error: "토큰 발급 실패", detail: tokenData }, { status: 500 });

    // 2. 각 종목별 데이터 수집 + 스코어링
    // 주의: KIS API는 초당 20회 제한 → 순차 호출 + 딜레이
    const signals = [];
    const pool = STOCK_POOL.slice(0, 15); // 첫 15종목만 (API 제한 고려)

    for (const stock of pool) {
      try {
        // 일봉 데이터
        const daily = await fetchDailyChart(stock.code, token, key, secret, base);
        if (!daily || daily.length < 60) continue;

        // 최신순 → 오래된순으로 정렬
        const sorted = [...daily].reverse();
        const closes = sorted.map(d => parseInt(d.stck_clpr) || 0);
        const highs = sorted.map(d => parseInt(d.stck_hgpr) || 0);
        const lows = sorted.map(d => parseInt(d.stck_lwpr) || 0);
        const volumes = sorted.map(d => parseInt(d.acml_vol) || 0);
        const dates = sorted.map(d => d.stck_bsop_date);

        // 현재가
        const priceInfo = await fetchCurrentPrice(stock.code, token, key, secret, base);
        const currentPrice = parseInt(priceInfo.stck_prpr) || closes[closes.length - 1];
        const prevClose = parseInt(priceInfo.stck_sdpr) || closes[closes.length - 2];
        const changePercent = prevClose > 0 ? ((currentPrice - prevClose) / prevClose * 100).toFixed(2) : "0.00";

        // 스코어링
        const result = calculateScore({ closes, highs, lows, volumes });

        signals.push({
          ...stock,
          price: currentPrice,
          chg: parseFloat(changePercent),
          volume: volumes[volumes.length - 1],
          ...result,
        });

        // API 호출 제한 대응 (100ms 딜레이)
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        console.error(`Error processing ${stock.name}:`, err.message);
      }
    }

    // 확률 높은 순 정렬
    signals.sort((a, b) => b.probability - a.probability);

    return Response.json({ mode: "live", signals, timestamp: new Date().toISOString() });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// ─── 데모 데이터 ───────────────────────────────────────────
function generateDemoSignals() {
  return STOCK_POOL.slice(0, 20).map((s, i) => {
    const prob = Math.round(87 - i * 3.5 + (Math.random() - 0.5) * 6);
    const score = Math.round(92 - i * 3 + (Math.random() - 0.5) * 5);
    const price = Math.round(50000 + Math.random() * 350000);
    const chg = +(Math.random() * 7 - 1.5).toFixed(2);
    const reasons = [
      "120일 고점 돌파 임박 + 거래량 급증",
      "강한 상승 추세 + 섹터 내 강세",
      "변동성 수축 후 돌파 예상",
      "거래량 급증 감지 + 추세 전환",
      "섹터 모멘텀 강세",
      "기관 순매수 지속 + 추세 강화",
    ];
    return {
      ...s,
      price, chg,
      score: Math.min(Math.max(score, 40), 98),
      probability: Math.min(Math.max(prob, 35), 95),
      features: {
        breakout: +(70 + Math.random() * 30).toFixed(0),
        volumeZ: +(40 + Math.random() * 55).toFixed(0),
        trend: +(55 + Math.random() * 45).toFixed(0),
        volContraction: +(45 + Math.random() * 55).toFixed(0),
        sectorRS: +(50 + Math.random() * 50).toFixed(0),
      },
      volZRaw: (1 + Math.random() * 3).toFixed(1),
      reason: reasons[i % reasons.length],
      volume: Math.floor(Math.random() * 8e6 + 1e6),
    };
  }).sort((a, b) => b.probability - a.probability);
}
