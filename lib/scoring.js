// ═══════════════════════════════════════════════════════════════
// QuantSignal Scoring Engine
// 5개 피처 기반 규칙 스코어링 → 확률 추정
// ═══════════════════════════════════════════════════════════════

// ─── 기본 지표 계산 ────────────────────────────────────────
export function calcSMA(prices, period) {
  return prices.map((_, i) => {
    if (i < period - 1) return null;
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += prices[j];
    return s / period;
  });
}

export function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return [];
  const rsi = [];
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d >= 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  rsi.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
    al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
    rsi.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  return rsi;
}

export function calcBollinger(prices, period = 20) {
  const sma = calcSMA(prices, period);
  const bandwidth = [];
  for (let i = 0; i < prices.length; i++) {
    if (sma[i] === null) { bandwidth.push(null); continue; }
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (prices[j] - sma[i]) ** 2;
    const std = Math.sqrt(sq / period);
    bandwidth.push(sma[i] > 0 ? (4 * std / sma[i]) * 100 : 0);
  }
  return bandwidth;
}

// ─── 피처 엔지니어링 ───────────────────────────────────────

/**
 * Feature 1: 돌파 거리 (Breakout Distance)
 * 현재가가 120일 고점 대비 얼마나 가까운지
 * 높을수록 돌파 임박 → 높은 점수
 */
export function featureBreakoutDistance(closes, highs) {
  if (closes.length < 120) return 50; // 데이터 부족 시 중립
  const high120 = Math.max(...highs.slice(-120));
  const current = closes[closes.length - 1];
  const distance = (current / high120) * 100;
  // 95~100% = 돌파 임박 (고점수), 80% 이하 = 낮은 점수
  if (distance >= 98) return 95;
  if (distance >= 95) return 85;
  if (distance >= 90) return 70;
  if (distance >= 85) return 55;
  if (distance >= 80) return 40;
  return 25;
}

/**
 * Feature 2: 거래량 Z-score
 * 최근 거래량이 평균 대비 얼마나 높은지
 * 거래량 급증 = 높은 관심 → 높은 점수
 */
export function featureVolumeZScore(volumes) {
  if (volumes.length < 20) return 50;
  const recent = volumes.slice(-5);
  const baseline = volumes.slice(-60, -5);
  if (baseline.length === 0) return 50;
  const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
  const std = Math.sqrt(baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / baseline.length);
  if (std === 0) return 50;
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const zScore = (recentAvg - mean) / std;

  // z-score → 점수 변환
  if (zScore >= 3) return 95;
  if (zScore >= 2) return 85;
  if (zScore >= 1.5) return 75;
  if (zScore >= 1) return 65;
  if (zScore >= 0.5) return 55;
  if (zScore >= 0) return 45;
  return 30;
}

/**
 * Feature 3: 추세 강도 (MA20 vs MA60)
 * 이동평균 정배열 여부 + 기울기
 */
export function featureTrend(closes) {
  if (closes.length < 60) return 50;
  const sma20 = calcSMA(closes, 20);
  const sma60 = calcSMA(closes, 60);
  const last = closes.length - 1;
  const m20 = sma20[last];
  const m60 = sma60[last];
  const price = closes[last];

  if (!m20 || !m60) return 50;

  let score = 50;

  // 정배열 (가격 > MA20 > MA60)
  if (price > m20 && m20 > m60) score += 25;
  else if (price > m60) score += 10;
  else score -= 15;

  // MA20 기울기 (최근 5일)
  const m20_5ago = sma20[last - 5];
  if (m20_5ago && m20 > m20_5ago) {
    const slope = ((m20 - m20_5ago) / m20_5ago) * 100;
    if (slope > 1) score += 15;
    else if (slope > 0.3) score += 8;
  } else {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Feature 4: 변동성 수축 (Volatility Contraction)
 * 볼린저밴드 수축 → 큰 움직임 임박 신호
 */
export function featureVolatilityContraction(closes) {
  if (closes.length < 60) return 50;
  const bw = calcBollinger(closes, 20);
  const valid = bw.filter(b => b !== null);
  if (valid.length < 20) return 50;

  const recent = valid.slice(-5);
  const historical = valid.slice(-60, -5);
  if (historical.length === 0) return 50;

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const histAvg = historical.reduce((a, b) => a + b, 0) / historical.length;

  // 수축 비율 (낮을수록 수축 → 돌파 임박)
  const ratio = recentAvg / histAvg;

  if (ratio < 0.5) return 95;  // 극단적 수축
  if (ratio < 0.65) return 85;
  if (ratio < 0.8) return 70;
  if (ratio < 1.0) return 55;
  return 35;  // 확장 중
}

/**
 * Feature 5: 섹터 상대강도 (Sector Relative Strength)
 * 같은 섹터 내에서 상대적 수익률
 * (섹터 데이터 없으면 RSI로 대체)
 */
export function featureSectorRS(closes) {
  if (closes.length < 20) return 50;
  const rsi = calcRSI(closes, 14);
  if (rsi.length === 0) return 50;
  const lastRsi = rsi[rsi.length - 1];

  // RSI 기반 점수 (40~60이 중립, 극단은 역전 가능성)
  if (lastRsi >= 55 && lastRsi <= 70) return 80; // 적정 강세
  if (lastRsi >= 45 && lastRsi < 55) return 60;  // 중립
  if (lastRsi >= 70) return 65; // 과매수 주의
  if (lastRsi >= 30 && lastRsi < 45) return 45;  // 약세
  if (lastRsi < 30) return 55; // 과매도 반등 가능
  return 50;
}

// ─── 종합 스코어 계산 ──────────────────────────────────────

const WEIGHTS = {
  breakout: 0.25,
  volumeZ: 0.2,
  trend: 0.25,
  volContraction: 0.15,
  sectorRS: 0.15,
};

/**
 * 종합 스코어 계산
 * @param {Object} ohlcv - { closes, highs, lows, volumes }
 * @returns {Object} - { score, probability, features, reason }
 */
export function calculateScore(ohlcv) {
  const { closes, highs, volumes } = ohlcv;

  const features = {
    breakout: featureBreakoutDistance(closes, highs),
    volumeZ: featureVolumeZScore(volumes),
    trend: featureTrend(closes),
    volContraction: featureVolatilityContraction(closes),
    sectorRS: featureSectorRS(closes),
  };

  // 가중 평균 스코어
  const score = Math.round(
    features.breakout * WEIGHTS.breakout +
    features.volumeZ * WEIGHTS.volumeZ +
    features.trend * WEIGHTS.trend +
    features.volContraction * WEIGHTS.volContraction +
    features.sectorRS * WEIGHTS.sectorRS
  );

  // 스코어 → 확률 매핑 (시그모이드 유사 변환)
  // 실제 ML 모델 전까지 임시 매핑
  const probability = scoreToProbability(score);

  // 가장 높은 피처 기반 이유 생성
  const reason = generateReason(features);

  // 거래량 z-score 원본값 계산
  const baseline = volumes.length >= 60 ? volumes.slice(-60, -5) : volumes.slice(0, -5);
  const mean = baseline.length > 0 ? baseline.reduce((a, b) => a + b, 0) / baseline.length : 1;
  const std = baseline.length > 0 ? Math.sqrt(baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / baseline.length) : 1;
  const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const volZRaw = std > 0 ? ((recentVol - mean) / std).toFixed(1) : "0.0";

  return {
    score,
    probability,
    features,
    volZRaw,
    reason,
  };
}

function scoreToProbability(score) {
  // S자 커브: 스코어 50 → 확률 40%, 스코어 80 → 확률 72%, 스코어 95 → 확률 88%
  const x = (score - 50) / 20;
  const sigmoid = 1 / (1 + Math.exp(-x));
  return Math.round(sigmoid * 100 * 0.9 + 5); // 5~95% 범위
}

function generateReason(features) {
  const reasons = [];

  if (features.breakout >= 85)
    reasons.push("120일 고점 돌파 임박");
  if (features.volumeZ >= 75)
    reasons.push("거래량 급증 감지");
  if (features.trend >= 75)
    reasons.push("강한 상승 추세");
  if (features.volContraction >= 80)
    reasons.push("변동성 수축 후 돌파 예상");
  if (features.sectorRS >= 75)
    reasons.push("섹터 내 강세");

  if (reasons.length === 0) {
    if (features.trend >= 60) reasons.push("완만한 상승 추세");
    else reasons.push("시그널 관찰 중");
  }

  return reasons.slice(0, 2).join(" + ");
}

// ─── 분석 대상 종목 리스트 ──────────────────────────────────
// KIS API에서 전 종목 스캔은 호출 제한이 있으므로
// 주요 종목 풀을 미리 정의
export const STOCK_POOL = [
  { code: "005930", name: "삼성전자", sector: "반도체" },
  { code: "000660", name: "SK하이닉스", sector: "반도체" },
  { code: "005380", name: "현대차", sector: "자동차" },
  { code: "000270", name: "기아", sector: "자동차" },
  { code: "012330", name: "현대모비스", sector: "자동차" },
  { code: "006400", name: "삼성SDI", sector: "배터리" },
  { code: "051910", name: "LG화학", sector: "화학" },
  { code: "373220", name: "LG에너지솔루션", sector: "배터리" },
  { code: "035420", name: "NAVER", sector: "IT" },
  { code: "035720", name: "카카오", sector: "IT" },
  { code: "068270", name: "셀트리온", sector: "바이오" },
  { code: "207940", name: "삼성바이오로직스", sector: "바이오" },
  { code: "005490", name: "POSCO홀딩스", sector: "소재" },
  { code: "003670", name: "포스코퓨처엠", sector: "소재" },
  { code: "105560", name: "KB금융", sector: "금융" },
  { code: "055550", name: "신한지주", sector: "금융" },
  { code: "086790", name: "하나금융지주", sector: "금융" },
  { code: "028260", name: "삼성물산", sector: "건설" },
  { code: "034730", name: "SK", sector: "지주" },
  { code: "003550", name: "LG", sector: "지주" },
  { code: "066570", name: "LG전자", sector: "가전" },
  { code: "010130", name: "고려아연", sector: "소재" },
  { code: "009150", name: "삼성전기", sector: "반도체" },
  { code: "018260", name: "삼성에스디에스", sector: "IT" },
  { code: "030200", name: "KT", sector: "통신" },
  { code: "017670", name: "SK텔레콤", sector: "통신" },
  { code: "032830", name: "삼성생명", sector: "금융" },
  { code: "015760", name: "한국전력", sector: "유틸리티" },
  { code: "034020", name: "두산에너빌리티", sector: "에너지" },
  { code: "247540", name: "에코프로비엠", sector: "배터리" },
];
