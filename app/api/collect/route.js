// ═══════════════════════════════════════════════════════════
// 시세 수집 Cron Job
// Vercel Cron으로 매일 16:30 (장 마감 후) 자동 실행
// 
// 1. KIS API로 거래량 상위 종목 수집
// 2. 각 종목 일봉 180일 수집 → daily_prices 저장
// 3. 스코어링 → signals 저장
// 4. 수집 로그 기록
// ═══════════════════════════════════════════════════════════

import { calculateScore, STOCK_POOL } from "@/lib/scoring";
import { getWriteClient } from "@/lib/supabase";

function formatDate(d) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export async function GET(request) {
  // Cron Job 인증 (헤더 또는 쿼리 파라미터)
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.KIS_APP_KEY;
  const secret = process.env.KIS_APP_SECRET;
  const base = process.env.KIS_API_BASE || "https://openapi.koreainvestment.com:9443";
  const db = getWriteClient();
  const startTime = Date.now();
  const today = todayStr();

  // KIS API 없으면 데모 수집
  if (!key || !secret) {
    await runDemoCollection(db, today, startTime);
    return Response.json({ mode: "demo", message: "데모 데이터 수집 완료" });
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
    if (!token) throw new Error("토큰 발급 실패");

    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: key, appsecret: secret,
    };

    // 2. 거래량 상위 종목 수집 (API 1회)
    const volParams = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J", FID_COND_SCR_DIV_CODE: "20171",
      FID_INPUT_ISCD: "0000", FID_DIV_CLS_CODE: "0", FID_BLNG_CLS_CODE: "0",
      FID_TRGT_CLS_CODE: "111111111", FID_TRGT_EXLS_CLS_CODE: "0000000000",
      FID_INPUT_PRICE_1: "5000", FID_INPUT_PRICE_2: "",
      FID_VOL_CNT: "100000", FID_INPUT_DATE_1: "",
    });

    const volRes = await fetch(
      `${base}/uapi/domestic-stock/v1/quotations/volume-rank?${volParams}`,
      { headers: { ...headers, tr_id: "FHPST01710000" } }
    );
    const volData = await volRes.json();
    const topStocks = (volData.output || []).slice(0, 30);

    // STOCK_POOL도 합치기 (중복 제거)
    const codeSet = new Set(topStocks.map(s => s.mksc_shrn_iscd));
    const poolExtras = STOCK_POOL.filter(s => !codeSet.has(s.code)).slice(0, 10);

    let scannedCount = 0;
    let signalCount = 0;

    // 3. 각 종목별 일봉 수집 + 스코어링
    // 거래량 상위 종목
    for (const s of topStocks) {
      const code = s.mksc_shrn_iscd;
      const name = s.hts_kor_isnm || code;
      const price = parseInt(s.stck_prpr) || 0;
      const changePct = parseFloat(s.prdy_ctrt) || 0;
      const volume = parseInt(s.acml_vol) || 0;

      try {
        // 종목 마스터 upsert
        await db.insert("stocks", { code, name, market: "KOSPI", is_active: true, updated_at: new Date().toISOString() }, { upsert: true, onConflict: "code" });

        // 일봉 수집
        const chartResult = await fetchAndStoreDailyPrices(code, token, headers, base, db);

        // 스코어링
        if (chartResult.closes.length >= 60) {
          const scoreResult = calculateScore({
            closes: chartResult.closes,
            highs: chartResult.highs,
            lows: chartResult.lows,
            volumes: chartResult.volumes,
          });

          const avgVol = parseInt(s.avrg_vol) || 1;
          const volRatio = avgVol > 0 ? (volume / avgVol).toFixed(2) : "1.00";

          await db.insert("signals", {
            stock_code: code,
            signal_date: today,
            current_price: price,
            change_pct: changePct,
            volume,
            vol_ratio: parseFloat(volRatio),
            feat_breakout: scoreResult.features.breakout,
            feat_volume_z: scoreResult.features.volumeZ,
            feat_trend: scoreResult.features.trend,
            feat_vol_contraction: scoreResult.features.volContraction,
            feat_sector_rs: scoreResult.features.sectorRS,
            vol_z_raw: parseFloat(scoreResult.volZRaw) || 0,
            score: scoreResult.score,
            probability: scoreResult.probability,
            reason: scoreResult.reason,
          }, { upsert: true, onConflict: "stock_code,signal_date" });

          signalCount++;
        }

        scannedCount++;
        // API 제한 대응
        await sleep(120);
      } catch (err) {
        console.error(`Error: ${code} - ${err.message}`);
      }
    }

    // STOCK_POOL 추가 종목도 수집
    for (const s of poolExtras) {
      try {
        await db.insert("stocks", { code: s.code, name: s.name, sector: s.sector, market: "KOSPI", is_active: true, updated_at: new Date().toISOString() }, { upsert: true, onConflict: "code" });

        const chartResult = await fetchAndStoreDailyPrices(s.code, token, headers, base, db);

        if (chartResult.closes.length >= 60) {
          const scoreResult = calculateScore({
            closes: chartResult.closes, highs: chartResult.highs,
            lows: chartResult.lows, volumes: chartResult.volumes,
          });

          // 현재가는 마지막 종가 사용
          const lastClose = chartResult.closes[chartResult.closes.length - 1];
          const prevClose = chartResult.closes[chartResult.closes.length - 2] || lastClose;
          const chg = prevClose > 0 ? ((lastClose - prevClose) / prevClose * 100).toFixed(2) : "0";

          await db.insert("signals", {
            stock_code: s.code, signal_date: today,
            current_price: lastClose, change_pct: parseFloat(chg),
            volume: chartResult.volumes[chartResult.volumes.length - 1],
            vol_ratio: 1.0,
            feat_breakout: scoreResult.features.breakout,
            feat_volume_z: scoreResult.features.volumeZ,
            feat_trend: scoreResult.features.trend,
            feat_vol_contraction: scoreResult.features.volContraction,
            feat_sector_rs: scoreResult.features.sectorRS,
            vol_z_raw: parseFloat(scoreResult.volZRaw) || 0,
            score: scoreResult.score, probability: scoreResult.probability,
            reason: scoreResult.reason,
          }, { upsert: true, onConflict: "stock_code,signal_date" });

          signalCount++;
        }
        scannedCount++;
        await sleep(120);
      } catch (err) {
        console.error(`Error pool: ${s.code} - ${err.message}`);
      }
    }

    // 4. 수집 로그
    const duration = Date.now() - startTime;
    await db.insert("collection_logs", {
      collection_date: today, stocks_scanned: scannedCount,
      signals_generated: signalCount, duration_ms: duration, status: "success",
    });

    return Response.json({
      mode: "live", message: "수집 완료",
      scanned: scannedCount, signals: signalCount,
      duration: `${(duration / 1000).toFixed(1)}s`,
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    await db.insert("collection_logs", {
      collection_date: today, status: "error", error_message: err.message, duration_ms: duration,
    }).catch(() => {});
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// ─── 일봉 수집 + DB 저장 ────────────────────────────────────
async function fetchAndStoreDailyPrices(code, token, headers, base, db) {
  const end = new Date();
  const start = new Date(); start.setDate(start.getDate() - 180);

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: formatDate(start), FID_INPUT_DATE_2: formatDate(end),
    FID_PERIOD_DIV_CODE: "D", FID_ORG_ADJ_PRC: "0",
  });

  const res = await fetch(
    `${base}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`,
    { headers: { ...headers, tr_id: "FHKST03010100" } }
  );
  const data = await res.json();
  const raw = data.output2 || [];

  const sorted = [...raw].reverse();
  const closes = sorted.map(d => parseInt(d.stck_clpr) || 0);
  const highs = sorted.map(d => parseInt(d.stck_hgpr) || 0);
  const lows = sorted.map(d => parseInt(d.stck_lwpr) || 0);
  const volumes = sorted.map(d => parseInt(d.acml_vol) || 0);

  // DB에 저장 (최근 60일만, 비용 절약)
  const recentRows = sorted.slice(-60).map(d => ({
    stock_code: code,
    trade_date: `${d.stck_bsop_date.substring(0,4)}-${d.stck_bsop_date.substring(4,6)}-${d.stck_bsop_date.substring(6,8)}`,
    open_price: parseInt(d.stck_oprc) || 0,
    high_price: parseInt(d.stck_hgpr) || 0,
    low_price: parseInt(d.stck_lwpr) || 0,
    close_price: parseInt(d.stck_clpr) || 0,
    volume: parseInt(d.acml_vol) || 0,
    change_pct: parseFloat(d.prdy_ctrt) || 0,
  }));

  if (recentRows.length > 0) {
    await db.insert("daily_prices", recentRows, { upsert: true, onConflict: "stock_code,trade_date" });
  }

  return { closes, highs, lows, volumes };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── 데모 수집 (KIS 키 없을 때) ─────────────────────────────
async function runDemoCollection(db, today, startTime) {
  const demoStocks = [
    { code: "005930", name: "삼성전자", sector: "반도체" },
    { code: "000660", name: "SK하이닉스", sector: "반도체" },
    { code: "005380", name: "현대차", sector: "자동차" },
    { code: "035420", name: "NAVER", sector: "IT" },
    { code: "051910", name: "LG화학", sector: "화학" },
    { code: "006400", name: "삼성SDI", sector: "배터리" },
    { code: "068270", name: "셀트리온", sector: "바이오" },
    { code: "105560", name: "KB금융", sector: "금융" },
    { code: "373220", name: "LG에너지솔루션", sector: "배터리" },
    { code: "000270", name: "기아", sector: "자동차" },
  ];

  for (const s of demoStocks) {
    await db.insert("stocks", { code: s.code, name: s.name, sector: s.sector, market: "KOSPI", is_active: true }, { upsert: true, onConflict: "code" });

    const price = Math.round(50000 + Math.random() * 300000);
    const chg = +(Math.random() * 7 - 1.5).toFixed(2);
    const prob = Math.round(45 + Math.random() * 45);
    const score = Math.round(50 + Math.random() * 40);

    await db.insert("signals", {
      stock_code: s.code, signal_date: today,
      current_price: price, change_pct: chg,
      volume: Math.floor(Math.random() * 5e6 + 5e5),
      vol_ratio: +(1 + Math.random() * 3).toFixed(2),
      feat_breakout: Math.round(50 + Math.random() * 40),
      feat_volume_z: Math.round(40 + Math.random() * 50),
      feat_trend: Math.round(45 + Math.random() * 45),
      feat_vol_contraction: Math.round(40 + Math.random() * 50),
      feat_sector_rs: Math.round(45 + Math.random() * 45),
      vol_z_raw: +(1 + Math.random() * 2.5).toFixed(1),
      score, probability: prob,
      reason: ["거래량 급증", "상승 전환", "추세 강세", "변동성 수축"][Math.floor(Math.random() * 4)],
    }, { upsert: true, onConflict: "stock_code,signal_date" });
  }

  await db.insert("collection_logs", {
    collection_date: today, stocks_scanned: demoStocks.length,
    signals_generated: demoStocks.length, duration_ms: Date.now() - startTime, status: "demo",
  });
}
