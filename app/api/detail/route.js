// ═══════════════════════════════════════════════════════════
// 종목 상세 API (DB 우선, 없으면 API 호출)
// 1. DB에서 일봉 데이터 조회
// 2. 부족하면 KIS API로 수집 → DB 저장
// 3. 스코어링 → 차트 데이터 반환
// ═══════════════════════════════════════════════════════════

import { calculateScore } from "@/lib/scoring";
import { getReadClient, getWriteClient } from "@/lib/supabase";

export async function POST(request) {
  const { code, name } = await request.json();
  const readDb = getReadClient();

  try {
    // 1. DB에서 일봉 데이터 조회
    const dailyData = await readDb.query("daily_prices", {
      select: "*",
      filters: { stock_code: `eq.${code}` },
      order: "trade_date.asc",
      limit: 180,
    });

    if (dailyData && dailyData.length >= 60) {
      // DB 데이터로 스코어링
      const closes = dailyData.map(d => d.close_price);
      const highs = dailyData.map(d => d.high_price);
      const lows = dailyData.map(d => d.low_price);
      const volumes = dailyData.map(d => parseInt(d.volume));

      const scoreResult = calculateScore({ closes, highs, lows, volumes });

      const chartData = dailyData.map(d => {
        const dt = new Date(d.trade_date);
        return {
          date: `${dt.getMonth()+1}/${dt.getDate()}`,
          open: d.open_price,
          high: d.high_price,
          low: d.low_price,
          close: d.close_price,
          volume: parseInt(d.volume),
        };
      });

      const lastPrice = closes[closes.length - 1];
      const prevPrice = closes[closes.length - 2] || lastPrice;
      const chg = prevPrice > 0 ? ((lastPrice - prevPrice) / prevPrice * 100).toFixed(2) : "0";

      return Response.json({
        mode: "db",
        detail: {
          code, name: name || code,
          price: lastPrice,
          chg: parseFloat(chg),
          volume: volumes[volumes.length - 1],
          ...scoreResult,
          chartData,
        },
      });
    }

    // 2. DB에 데이터 부족 → KIS API 호출 시도
    const key = process.env.KIS_APP_KEY;
    const secret = process.env.KIS_APP_SECRET;
    const base = process.env.KIS_API_BASE || "https://openapi.koreainvestment.com:9443";

    if (!key || !secret) {
      // API 키도 없으면 데모 데이터
      return Response.json({ mode: "demo", detail: generateDemoDetail(code, name) });
    }

    // KIS API로 수집
    const tokenRes = await fetch(`${base}/oauth2/tokenP`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", appkey: key, appsecret: secret }),
    });
    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;
    if (!token) return Response.json({ mode: "demo", detail: generateDemoDetail(code, name) });

    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`, appkey: key, appsecret: secret,
    };

    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - 180);

    function fmt(d) { return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`; }

    const dailyParams = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: fmt(start), FID_INPUT_DATE_2: fmt(end),
      FID_PERIOD_DIV_CODE: "D", FID_ORG_ADJ_PRC: "0",
    });

    const dailyRes = await fetch(
      `${base}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${dailyParams}`,
      { headers: { ...headers, tr_id: "FHKST03010100" } }
    );
    const dailyResult = await dailyRes.json();
    const rawDaily = dailyResult.output2 || [];

    if (rawDaily.length < 30) {
      return Response.json({ mode: "demo", detail: generateDemoDetail(code, name) });
    }

    const sorted = [...rawDaily].reverse();
    const closes = sorted.map(d => parseInt(d.stck_clpr) || 0);
    const highs = sorted.map(d => parseInt(d.stck_hgpr) || 0);
    const lows = sorted.map(d => parseInt(d.stck_lwpr) || 0);
    const volumes = sorted.map(d => parseInt(d.acml_vol) || 0);

    // DB에 저장
    const writeDb = getWriteClient();
    const rows = sorted.slice(-60).map(d => ({
      stock_code: code,
      trade_date: `${d.stck_bsop_date.substring(0,4)}-${d.stck_bsop_date.substring(4,6)}-${d.stck_bsop_date.substring(6,8)}`,
      open_price: parseInt(d.stck_oprc) || 0, high_price: parseInt(d.stck_hgpr) || 0,
      low_price: parseInt(d.stck_lwpr) || 0, close_price: parseInt(d.stck_clpr) || 0,
      volume: parseInt(d.acml_vol) || 0, change_pct: parseFloat(d.prdy_ctrt) || 0,
    }));
    await writeDb.insert("daily_prices", rows, { upsert: true, onConflict: "stock_code,trade_date" }).catch(() => {});

    const scoreResult = calculateScore({ closes, highs, lows, volumes });

    const chartData = sorted.map(d => {
      const ds = d.stck_bsop_date;
      return {
        date: `${parseInt(ds.substring(4,6))}/${parseInt(ds.substring(6,8))}`,
        open: parseInt(d.stck_oprc), high: parseInt(d.stck_hgpr),
        low: parseInt(d.stck_lwpr), close: parseInt(d.stck_clpr),
        volume: parseInt(d.acml_vol),
      };
    });

    const lastPrice = closes[closes.length - 1];
    const prevPrice = closes[closes.length - 2] || lastPrice;

    return Response.json({
      mode: "live",
      detail: {
        code, name: name || code,
        price: lastPrice,
        chg: parseFloat(((lastPrice - prevPrice) / prevPrice * 100).toFixed(2)),
        volume: volumes[volumes.length - 1],
        ...scoreResult, chartData,
      },
    });
  } catch (err) {
    return Response.json({ mode: "demo", detail: generateDemoDetail(code, name), error: err.message });
  }
}

function generateDemoDetail(code, name) {
  const basePrice = 50000 + Math.random() * 300000;
  const chartData = []; let p = basePrice * 0.85;
  const now = new Date();
  for (let i = 119; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const c = p * (1 + (Math.random() - 0.48) * 0.025);
    chartData.push({ date: `${d.getMonth()+1}/${d.getDate()}`, open: Math.round(p), high: Math.round(Math.max(p,c)*1.01), low: Math.round(Math.min(p,c)*0.99), close: Math.round(c), volume: Math.floor(Math.random()*5e6+5e5) });
    p = c;
  }
  const features = { breakout: Math.round(60+Math.random()*35), volumeZ: Math.round(40+Math.random()*50), trend: Math.round(50+Math.random()*45), volContraction: Math.round(45+Math.random()*50), sectorRS: Math.round(45+Math.random()*45) };
  const score = Math.round(features.breakout*.25+features.volumeZ*.2+features.trend*.25+features.volContraction*.15+features.sectorRS*.15);
  const x=(score-50)/20; const probability=Math.round((1/(1+Math.exp(-x)))*100*0.9+5);
  return { code, name: name||code, price: Math.round(p), chg: +(Math.random()*6-1).toFixed(2), volume: Math.floor(Math.random()*5e6), score, probability, features, volZRaw: (1+Math.random()*3).toFixed(1), reason: ["돌파 임박+거래량 급증","추세 강세","변동성 수축 후 돌파 예상"][Math.floor(Math.random()*3)], chartData };
}
