export async function POST(request) {
  try {
    const { stockName, stockCode, score, probability, features, reason, price, chg } = await request.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });

    const prompt = `당신은 한국 주식시장 퀀트 분석가입니다.

먼저 "${stockName}" 관련 최신 뉴스와 시황을 웹에서 검색해주세요.
그 다음 아래 스코어링 결과와 함께 종합 분석을 해주세요.

## 종목 정보
- 종목: ${stockName} (${stockCode})
- 현재가: ${price?.toLocaleString()}원 (${chg >= 0 ? "+" : ""}${chg}%)
- 종합스코어: ${score}/100
- 상승확률: ${probability}% (20일 내 +15% 확률)
- 시그널: ${reason}

## 피처 점수
- 돌파거리(120일 고점): ${features?.breakout}/100
- 거래량 Z-score: ${features?.volumeZ}/100
- 추세강도(MA20 vs MA60): ${features?.trend}/100
- 변동성 수축도: ${features?.volContraction}/100
- 섹터 상대강도: ${features?.sectorRS}/100

## 작성 형식 (총 300자 내외, 마크다운 없이)
1. [시황] 최신 뉴스/이슈 기반 현재 상황 (1~2줄)
2. [기술적 분석] 스코어 기반 핵심 포인트 2~3개 (각 한 줄)
3. [종합 의견] 매수/관망/매도 의견과 이유 (1줄)
4. [주의] 리스크 요인 1개 (1줄)`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json({ error: `API 오류: ${res.status} - ${errText}` }, { status: res.status });
    }

    const data = await res.json();
    // text 블록만 추출
    const analysisText = data.content
      ?.filter(c => c.type === "text")
      .map(c => c.text || "")
      .join("\n")
      .trim() || "분석 불가";

    return Response.json({ analysis: analysisText });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
