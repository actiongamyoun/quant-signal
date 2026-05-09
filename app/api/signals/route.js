// ═══════════════════════════════════════════════════════════
// 시그널 후보 리스트 API (가벼운 1차 스캔)
// KIS "거래량 상위" + "등락률 상위" API를 1~2회 호출
// → 간단한 필터링으로 시그널 후보 30개 선별
// → 상세 분석은 사용자가 클릭할 때만 (detail API에서 처리)
// ═══════════════════════════════════════════════════════════

export async function GET() {
  const key = process.env.KIS_APP_KEY;
  const secret = process.env.KIS_APP_SECRET;
  const base = process.env.KIS_API_BASE || "https://openapi.koreainvestment.com:9443";

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
    if (!token) return Response.json({ mode: "demo", signals: generateDemoSignals(), error: "토큰 발급 실패" });

    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: key,
      appsecret: secret,
    };

    // 2. 거래량 상위 종목 조회 (API 1회)
    const volParams = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_COND_SCR_DIV_CODE: "20171",
      FID_INPUT_ISCD: "0000",
      FID_DIV_CLS_CODE: "0",
      FID_BLNG_CLS_CODE: "0",
      FID_TRGT_CLS_CODE: "111111111",
      FID_TRGT_EXLS_CLS_CODE: "0000000000",
      FID_INPUT_PRICE_1: "5000",    // 5000원 이상
      FID_INPUT_PRICE_2: "",
      FID_VOL_CNT: "100000",        // 거래량 10만 이상
      FID_INPUT_DATE_1: "",
    });

    const volRes = await fetch(
      `${base}/uapi/domestic-stock/v1/quotations/volume-rank?${volParams}`,
      { headers: { ...headers, tr_id: "FHPST01710000" } }
    );
    const volData = await volRes.json();
    const volStocks = (volData.output || []).slice(0, 30);

    // 3. 등락률 상위 종목 조회 (API 1회) - 추가 후보
    // 상승률 상위
    const riseParams = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_COND_SCR_DIV_CODE: "20170",
      FID_INPUT_ISCD: "0000",
      FID_DIV_CLS_CODE: "0",
      FID_BLNG_CLS_CODE: "0",
      FID_TRGT_CLS_CODE: "111111111",
      FID_TRGT_EXLS_CLS_CODE: "0000000000",
      FID_INPUT_PRICE_1: "5000",
      FID_INPUT_PRICE_2: "",
      FID_VOL_CNT: "50000",
      FID_INPUT_DATE_1: "",
    });

    let riseStocks = [];
    try {
      const riseRes = await fetch(
        `${base}/uapi/domestic-stock/v1/quotations/volume-rank?${riseParams}`,
        { headers: { ...headers, tr_id: "FHPST01710000" } }
      );
      const riseData = await riseRes.json();
      riseStocks = (riseData.output || []).slice(0, 15);
    } catch {}

    // 4. 중복 제거 + 1차 필터링
    const seen = new Set();
    const candidates = [];

    const allStocks = [...volStocks, ...riseStocks];
    for (const s of allStocks) {
      const code = s.mksc_shrn_iscd || s.stck_shrn_iscd;
      if (!code || seen.has(code)) continue;
      seen.add(code);

      const price = parseInt(s.stck_prpr) || 0;
      const change = parseFloat(s.prdy_ctrt) || 0;
      const volume = parseInt(s.acml_vol) || 0;
      const name = s.hts_kor_isnm || s.stck_shrn_iscd || code;
      const avgVol = parseInt(s.avrg_vol) || 1;
      const volRatio = avgVol > 0 ? volume / avgVol : 1;

      // 1차 필터: 가격 5000원+, 거래량 비율 1.5배+, 등락률 -5%~+15%
      if (price < 5000) continue;
      if (change < -5 || change > 15) continue;

      // 간단한 1차 스코어 (상세 분석 전)
      let quickScore = 50;
      // 거래량 급증 가산점
      if (volRatio >= 3) quickScore += 20;
      else if (volRatio >= 2) quickScore += 15;
      else if (volRatio >= 1.5) quickScore += 10;
      // 상승 중 가산점
      if (change >= 3) quickScore += 15;
      else if (change >= 1) quickScore += 10;
      else if (change >= 0) quickScore += 5;
      // 적정 가격대 가산점
      if (price >= 10000 && price <= 500000) quickScore += 5;

      // 간이 확률 추정
      const x = (quickScore - 50) / 20;
      const probability = Math.round((1 / (1 + Math.exp(-x))) * 100 * 0.85 + 8);

      candidates.push({
        code,
        name,
        sector: "—", // 상세 진입 시 확인
        price,
        chg: change,
        volume,
        volRatio: volRatio.toFixed(1),
        quickScore,
        probability,
        reason: generateQuickReason(change, volRatio),
        needsDetail: true, // 상세 분석 필요 표시
      });
    }

    // 확률 높은 순 정렬 → 상위 30개
    candidates.sort((a, b) => b.probability - a.probability);
    const signals = candidates.slice(0, 30);

    return Response.json({
      mode: "live",
      signals,
      timestamp: new Date().toISOString(),
      scanned: allStocks.length,
    });
  } catch (err) {
    return Response.json({ mode: "demo", signals: generateDemoSignals(), error: err.message });
  }
}

function generateQuickReason(change, volRatio) {
  const reasons = [];
  if (volRatio >= 3) reasons.push("거래량 급증");
  else if (volRatio >= 2) reasons.push("거래량 증가");
  if (change >= 3) reasons.push("강한 상승세");
  else if (change >= 1) reasons.push("상승 전환");
  if (reasons.length === 0) reasons.push("모니터링 대상");
  return reasons.join(" + ");
}

// ─── 데모 데이터 ───────────────────────────────────────────
function generateDemoSignals() {
  const stocks = [
    { code: "000660", name: "SK하이닉스", sector: "반도체" },
    { code: "005930", name: "삼성전자", sector: "반도체" },
    { code: "051910", name: "LG화학", sector: "화학" },
    { code: "006400", name: "삼성SDI", sector: "배터리" },
    { code: "035420", name: "NAVER", sector: "IT" },
    { code: "005380", name: "현대차", sector: "자동차" },
    { code: "068270", name: "셀트리온", sector: "바이오" },
    { code: "003670", name: "포스코퓨처엠", sector: "소재" },
    { code: "105560", name: "KB금융", sector: "금융" },
    { code: "055550", name: "신한지주", sector: "금융" },
    { code: "034730", name: "SK", sector: "지주" },
    { code: "028260", name: "삼성물산", sector: "건설" },
    { code: "373220", name: "LG에너지솔루션", sector: "배터리" },
    { code: "207940", name: "삼성바이오로직스", sector: "바이오" },
    { code: "000270", name: "기아", sector: "자동차" },
    { code: "066570", name: "LG전자", sector: "가전" },
    { code: "009150", name: "삼성전기", sector: "반도체" },
    { code: "247540", name: "에코프로비엠", sector: "배터리" },
    { code: "005490", name: "POSCO홀딩스", sector: "소재" },
    { code: "030200", name: "KT", sector: "통신" },
  ];

  return stocks.map((s, i) => {
    const prob = Math.round(87 - i * 3.5 + (Math.random() - 0.5) * 6);
    const price = Math.round(50000 + Math.random() * 350000);
    const chg = +(Math.random() * 7 - 1.5).toFixed(2);
    const volRatio = (1.5 + Math.random() * 3).toFixed(1);
    const reasons = ["거래량 급증 + 강한 상승세", "상승 전환 + 거래량 증가", "거래량 급증", "강한 상승세", "모니터링 대상", "거래량 증가 + 상승 전환"];
    return {
      ...s, price, chg, volume: Math.floor(Math.random() * 8e6 + 1e6),
      volRatio,
      quickScore: Math.round(60 + Math.random() * 30),
      probability: Math.min(Math.max(prob, 35), 95),
      reason: reasons[i % reasons.length],
      needsDetail: true,
    };
  }).sort((a, b) => b.probability - a.probability);
}
