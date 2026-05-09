export async function POST(request) {
  try {
    const { stockName, stockCode, score, probability, features, reason, price, chg } = await request.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });

    const prompt = `당신은 한국 주식시장 퀀트 분석가입니다. 아래 종목의 스코어링 결과를 기반으로 간결한 투자 의견을 한국어로 작성해주세요.

종목: ${stockName} (${stockCode})
현재가: ${price?.toLocaleString()}원 (${chg >= 0 ? "+" : ""}${chg}%)
종합스코어: ${score}/100
상승확률: ${probability}% (20일 내 +15% 확률)
시그널 이유: ${reason}

피처 점수:
- 돌파거리(120일 고점): ${features?.breakout}/100
- 거래량 Z-score: ${features?.volumeZ}/100
- 추세강도(MA20 vs MA60): ${features?.trend}/100
- 변동성 수축도: ${features?.volContraction}/100
- 섹터 상대강도: ${features?.sectorRS}/100

다음 형식으로 간결하게 작성하세요 (총 200자 내외):
1. 한 줄 요약 (현재 상황)
2. 핵심 포인트 2~3개 (각 한 줄)
3. 주의할 점 1개

마크다운 없이 깔끔한 텍스트로 작성하세요.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
    });

    if (!res.ok) return Response.json({ error: `API 오류: ${res.status}` }, { status: res.status });
    const data = await res.json();
    return Response.json({ analysis: data.content?.map(c => c.text || "").join("") || "분석 불가" });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
