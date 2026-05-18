import { calculateScore, STOCK_POOL } from "@/lib/scoring";
import { getWriteClient } from "@/lib/supabase";

function formatDate(d) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

function todayStr() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getFullYear()}-${String(kst.getMonth()+1).padStart(2,"0")}-${String(kst.getDate()).padStart(2,"0")}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function GET(request) {
  // 인증
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
  const today = todayStr();
  const startTime = Date.now();

  // KIS API 없으면 데모
  if (!key || !secret) {
    return Response.json({ mode: "demo", message: "KIS API 키 없음 - 데모 모드", env: { hasKey: !!key, hasSecret: !!secret } });
  }

  let db;
  try {
    db = getWriteClient();
  } catch (e) {
    return Response.json({ error: "Supabase 연결 실패: " + e.message }, { status: 500 });
  }

  try {
    // 1. 토큰 발급
    const tokenUrl = `${base}/oauth2/tokenP`;
    const tokenBody = JSON.stringify({
      grant_type: "client_credentials",
      appkey: key,
      appsecret: secret,
    });

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: tokenBody,
    });

    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    if (!token) {
      return Response.json({
        error: "토큰 발급 실패",
        detail: tokenData,
        debug: {
          tokenUrl,
          keyLength: key.length,
          secretLength: secret.length,
          keyPreview: key.substring(0, 4) + "****",
          base,
        }
      }, { status: 500 });
    }

    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: key,
      appsecret: secret,
    };

    // 2. 거래량 상위 종목 수집 (API 1회)
    const volParams = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J", FID_COND_SCR_DIV_CODE: "20171",
      FID_INPUT_ISCD: "0000", FID_DIV_CLS_CODE: "0", FID_BLNG_CLS_CODE: "0",
      FID_TRGT_CLS_CODE: "111111111", FID_TRGT_EXLS_CLS_CODE: "0000000000",
      FID_INPUT_PRICE_1: "5000", FID_INPUT_PRICE_2: "",
      FID_VOL_CNT: "100000", FID_INPUT_DATE_1: "",
    });

    let topStocks = [];
    try {
      const volRes = await fetch(
        `${base}/uapi/domestic-stock/v1/quotations/volume-rank?${volParams}`,
        { headers: { ...headers, tr_id: "FHPST01710000" } }
      );
      const volData = await volRes.json();
      topStocks = (volData.output || []).slice(0, 20);
    } catch (e) {
      return Response.json({ error: "거래량 상위 조회 실패: " + e.message }, { status: 500 });
    }

    // STOCK_POOL 추가
    const codeSet = new Set(topStocks.map(s => s.mksc_shrn_iscd));
    const poolExtras = STOCK_POOL.filter(s => !codeSet.has(s.code)).slice(0, 10);

    let scannedCount = 0;
    let signalCount = 0;
    const errors = [];

    // 3. 거래량 상위 종목 처리
    for (const s of topStocks) {
      const code = s.mksc_shrn_iscd;
      const name = s.hts_kor_isnm || code;
      const price = parseInt(s.stck_prpr) || 0;
      const changePct = parseFloat(s.prdy_ctrt) || 0;
      const volume = parseInt(s.acml_vol) || 0;
      const avgVol = parseInt(s.avrg_vol) || 1;
      const volRatio = avgVol > 0 ? (volume / avgVol) : 1;

      try {
        // 종목 마스터 upsert
        await db.insert("stocks", {
          code, name, market: "KOSPI", is_active: true, updated_at: new Date().toISOString()
        }, { upsert: true, onConflict: "code" });

        // 일봉 수집
        const end = new Date();
        const start = new Date(); start.setDate(start.getDate() - 180);
        const dailyParams = new URLSearchParams({
          FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code,
          FID_INPUT_DATE_1: formatDate(start), FID_INPUT_DATE_2: formatDate(end),
          FID_PERIOD_DIV_CODE: "D", FID_ORG_ADJ_PRC: "0",
        });

        const dailyRes = await fetch(
          `${base}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${dailyParams}`,
          { headers: { ...headers, tr_id: "FHKST03010100" } }
        );
        const dailyData = await dailyRes.json();
        const raw = dailyData.output2 || [];

        if (raw.length < 30) { scannedCount++; continue; }

        const sorted = [...raw].reverse();
        const closes = sorted.map(d => parseInt(d.stck_clpr) || 0);
        const highs = sorted.map(d => parseInt(d.stck_hgpr) || 0);
        const lows = sorted.map(d => parseInt(d.stck_lwpr) || 0);
        const volumes = sorted.map(d => parseInt(d.acml_vol) || 0);

        // DB에 일봉 저장
        const recentRows = sorted.slice(-60).map(d => ({
          stock_code: code,
          trade_date: `${d.stck_bsop_date.substring(0,4)}-${d.stck_bsop_date.substring(4,6)}-${d.stck_bsop_date.substring(6,8)}`,
          open_price: parseInt(d.stck_oprc) || 0, high_price: parseInt(d.stck_hgpr) || 0,
          low_price: parseInt(d.stck_lwpr) || 0, close_price: parseInt(d.stck_clpr) || 0,
          volume: parseInt(d.acml_vol) || 0, change_pct: parseFloat(d.prdy_ctrt) || 0,
        }));
        await db.insert("daily_prices", recentRows, { upsert: true, onConflict: "stock_code,trade_date" });

        // 스코어링
        if (closes.length >= 60) {
          const scoreResult = calculateScore({ closes, highs, lows, volumes });

          await db.insert("signals", {
            stock_code: code, signal_date: today,
            current_price: price, change_pct: changePct, volume,
            vol_ratio: parseFloat(volRatio.toFixed(2)),
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
        errors.push(`${code}: ${err.message}`);
        scannedCount++;
      }
    }

    // 4. STOCK_POOL 추가 종목
    for (const s of poolExtras) {
      try {
        await db.insert("stocks", {
          code: s.code, name: s.name, sector: s.sector, market: "KOSPI", is_active: true, updated_at: new Date().toISOString()
        }, { upsert: true, onConflict: "code" });

        const end = new Date();
        const start = new Date(); start.setDate(start.getDate() - 180);
        const dailyParams = new URLSearchParams({
          FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: s.code,
          FID_INPUT_DATE_1: formatDate(start), FID_INPUT_DATE_2: formatDate(end),
          FID_PERIOD_DIV_CODE: "D", FID_ORG_ADJ_PRC: "0",
        });

        const dailyRes = await fetch(
          `${base}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${dailyParams}`,
          { headers: { ...headers, tr_id: "FHKST03010100" } }
        );
        const dailyData = await dailyRes.json();
        const raw = dailyData.output2 || [];

        if (raw.length < 30) { scannedCount++; continue; }

        const sorted = [...raw].reverse();
        const closes = sorted.map(d => parseInt(d.stck_clpr) || 0);
        const highs = sorted.map(d => parseInt(d.stck_hgpr) || 0);
        const lows = sorted.map(d => parseInt(d.stck_lwpr) || 0);
        const volumes = sorted.map(d => parseInt(d.acml_vol) || 0);

        const recentRows = sorted.slice(-60).map(d => ({
          stock_code: s.code,
          trade_date: `${d.stck_bsop_date.substring(0,4)}-${d.stck_bsop_date.substring(4,6)}-${d.stck_bsop_date.substring(6,8)}`,
          open_price: parseInt(d.stck_oprc) || 0, high_price: parseInt(d.stck_hgpr) || 0,
          low_price: parseInt(d.stck_lwpr) || 0, close_price: parseInt(d.stck_clpr) || 0,
          volume: parseInt(d.acml_vol) || 0, change_pct: parseFloat(d.prdy_ctrt) || 0,
        }));
        await db.insert("daily_prices", recentRows, { upsert: true, onConflict: "stock_code,trade_date" });

        if (closes.length >= 60) {
          const scoreResult = calculateScore({ closes, highs, lows, volumes });
          const lastClose = closes[closes.length - 1];
          const prevClose = closes[closes.length - 2] || lastClose;
          const chg = prevClose > 0 ? ((lastClose - prevClose) / prevClose * 100).toFixed(2) : "0";

          await db.insert("signals", {
            stock_code: s.code, signal_date: today,
            current_price: lastClose, change_pct: parseFloat(chg),
            volume: volumes[volumes.length - 1], vol_ratio: 1.0,
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
        errors.push(`${s.code}: ${err.message}`);
        scannedCount++;
      }
    }

    // 5. 수집 로그
    const duration = Date.now() - startTime;
    try {
      await db.insert("collection_logs", {
        collection_date: today, stocks_scanned: scannedCount,
        signals_generated: signalCount, duration_ms: duration, status: "success",
      });
    } catch {}

    return Response.json({
      mode: "live", message: "수집 완료",
      scanned: scannedCount, signals: signalCount,
      duration: `${(duration / 1000).toFixed(1)}s`,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return Response.json({ error: err.message, stack: err.stack?.substring(0, 300) }, { status: 500 });
  }
}
